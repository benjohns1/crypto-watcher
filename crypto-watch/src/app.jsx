import xs from 'xstream'
import debounce from 'xstream/extra/debounce'
import Immutable from 'immutable'

const log = val =>  { console.log(val); return val; };

/**
 * Determine user intent
 * @param {*} DOM 
 * @param {*} Time 
 */
const intent = (DOM, Time) => {

  // Settings
  const KEY_UP = 38;
  const KEY_DOWN = 40;
  const KEY_ENTER = 13;
  const KEY_TAB = 9;
  const acSelector = '.autocomplete';
  const removeSelector = '.remove';
  const addCoinSelector = '.addCoin';

  // Raw DOM selector events
  const input$ = DOM.select(acSelector).events('input');
  const keydown$ = DOM.select(acSelector).events('keydown');
  const clickRemove$ = DOM.select(removeSelector).events('click');
  const addCoinButton$ = DOM.select(addCoinSelector).events('click');

  // Intermediate event streams
  const inputText$ = input$.map(ev => ev.target.value);
  const enterPressed$ = keydown$.filter(({keyCode}) => keyCode === KEY_ENTER);

  // Compose intent streams
  const search$ = inputText$.compose(Time.debounce(100)).filter(search => search.length > 0).startWith('');
  const remove$ = clickRemove$.compose(Time.debounce(100)).map(getCoinIdFromClass);

  // Combine intents into actions object
  return {
    inputText$: inputText$,
    search$: search$,
    addCoin$: addCoinStream(enterPressed$, addCoinButton$, inputText$),
    removeCoin$: remove$
  }
};

/**
 * Given a DOM event, tries to parse coin ID from event target's classname
 * @param {*} ev 
 */
const getCoinIdFromClass = ev => {
  const idClass = Array.from(ev.target.classList).find(cssClass => cssClass.startsWith("id-"));
  if (!idClass) {
    return null;
  }
  return idClass.slice(3);
}

/**
 * Build stream of actions to add coins to watch list
 */
const addCoinStream = (enterPressed$, addCoinButton$, inputText$) => {
  const addCoinEvent$ = xs.merge(enterPressed$, addCoinButton$).mapTo(xs.of(true, false)).flatten();
  return xs.combine(addCoinEvent$, inputText$).filter(([addCoinEvent]) => addCoinEvent).map(([addCoinEvent, search]) => search);
};

/**
 * Render page header
 */
const renderHeader = state => {
  return <div>
    <h1>Crypto Watcher</h1>
    <input type="text" className="autocomplete" value={state.get('searchText')}></input><button className="addCoin">Add</button>
  </div>
}

const renderMessage = message => {
  if (!message) {
    return;
  }

  return <h2>{message}</h2>
}

/**
 * Render coin table
 * @param {*} coins 
 */
const renderCoinTable = coins => {
  if (coins.size <= 0) {
    return <p>No coins to watch</p>
  }

  // Build table rows
  const tableRows = coins.reduce((rows, coin, id) => {
    if (!coin || !coin.get('id')) {
      return rows.push(<tr>
        <td>{id}</td>
        <td></td>
        <td></td>
        <td></td>
        <td><button className={"remove id-" + id}>Remove</button></td>
      </tr>);
    }
    return rows.push(<tr>
      <td>{coin.get('name')}</td>
      <td>{coin.get('symbol')}</td>
      <td>${coin.get('price_usd')}</td>
      <td>{coin.get('price_btc')}</td>
      <td><button className={"remove id-" + id}>Remove</button></td>
    </tr>);
  }, Immutable.List());

  // Add table header and insert rows into template
  return <table>
    <tr>
      <th>Name</th>
      <th>Symbol</th>
      <th>USD</th>
      <th>BTC</th>
      <th> </th>
    </tr>
    {tableRows.toArray()}
  </table>
}

/**
 * Render main app view
 * @param {*} state$ 
 */
const view = state$ => state$.map(state => <div>
    {renderHeader(state)}
    {renderMessage(state.get('message'))}
    {renderCoinTable(state.get('coins'))}
  </div>
);

/**
 * Given actions and data streams, define new state stream
 * @param {*} ticker$ 
 * @param {*} actions 
 */
const model = (ticker$, storedCoinIds$, actions) => {

  // Ticker data
  const data$ = ticker$.map(res => {
    if (!res.ok) {
      return res.statusCode + ": " + statusText;
    }
    return Immutable.fromJS(JSON.parse(res.text));
  }).startWith("Loading...");

  // Given search text, determine if coin matches it
  const matchCoin = (search, coin, key) => {
    const lowerSearch = search.toLowerCase();
    if (key && (key.toLowerCase() === lowerSearch)) {
      return true;
    }
    if (!coin || !coin.get('id')) {
      return false;
    }
    if (coin.get('id').toLowerCase() === lowerSearch) {
      return true;
    }
    if (coin.get('name').toLowerCase() === lowerSearch) {
      return true;
    }
    if (coin.get('symbol').toLowerCase() === lowerSearch) {
      return true;
    }
    return false;
  };

  // Add coin to coin list
  const addCoin = coinToAdd => state => {

    const coins = state.get('coins');

    // Check if coin already exists
    if (coins.some((item, key) => matchCoin(coinToAdd, item, key))) {
      return state;
    }

    // Try to find new coin in ticker data
    const newCoin = state.get('ticker').find(item => matchCoin(coinToAdd, item));
    const newCoins = coins.set(newCoin ? newCoin.get('id') : coinToAdd, newCoin);
    return state.set('coins', newCoins).set('searchText', '');
  }

  // Runs whenever add coin action is fired
  const addCoinReducer$ = actions.addCoin$.map(addCoin);

  // Runs whenever remove coin action is fired
  const removeCoinReducer$ = actions.removeCoin$.map(coinToRemove => state => {
    // Remove any coins that match
    const coins = state.get('coins').filter((coin, id) => id !== coinToRemove);
    return state.set('coins', coins);
  });

  // Runs whenever ticker data is populated
  const tickerReducer$ = data$.map(ticker => state => {

    // If ticker doesn't have data yet, print its value as a message
    if (!Immutable.List.isList(ticker)) {
      return state.set('message', ticker);
    }

    // For all coins, (re)populate their values from ticker data
    const coins = state.get('coins').map((coin, id) => {
      return ticker.find(item => matchCoin(id, item))
    });

    // Return state with updated coins and ticker data
    return state.set('message', null).set('coins', coins).set('ticker', ticker);
  });

  // Runs whenever stored coin ID list response is triggered
  const storedCoinIdsReducer$ = storedCoinIds$.map(coinIds => state => {
    if (coinIds.length <= 0) {
      return state;
    }

    // For each stored coin ID, add and update state
    return coinIds.reduce((newState, coinId) => addCoin(coinId)(newState), state);
  });

  const inputTextReducer$ = actions.inputText$.map(inputText => state => {
    if (state.get('searchText') === inputText) {
      return state;
    }
    return state.set('searchText', inputText);
  });

  const reducer$ = xs.merge(addCoinReducer$, removeCoinReducer$, tickerReducer$, storedCoinIdsReducer$, inputTextReducer$);

  const state$ = reducer$.fold((state, reducer) => reducer(state), Immutable.Map({
    coins: Immutable.OrderedMap(),
    ticker: Immutable.List(),
    message: null,
    searchText: ''
  }));

  return state$;
}

export function App (sources) {

  // Request HTTP ticker data immediately when app loads
  const reloadTime = 60000; // refresh every minute
  const httpRequest$ = xs.combine(xs.of({
    url: 'https://api.coinmarketcap.com/v1/ticker/',
    category: 'ticker'
  }), xs.periodic(reloadTime).startWith(0)).map(([request]) => request);

  // HTTP ticker response stream
  const ticker$ = sources.HTTP.select('ticker').flatten();

  // Retrieve saved coins from local storage
  const storedCoinIds$ = sources.Storage.local.getItem('coinIds').take(1).map(coinIdsString => {
    const coinIds = JSON.parse(coinIdsString);
    if (!coinIds || coinIds.length <= 0) {
      // Default to eth & btc if coinlist is empty
      return ['bitcoin', 'ethereum'];
    }
    return coinIds;
  });

  // MVI
  const actions = intent(sources.DOM, sources.Time);
  const state$ = model(ticker$, storedCoinIds$, actions);
  const vdom$ = view(state$);

  // Store coin list in local storage whenever state changes
  const storageRequest$ = state$.map(state => {
    let coinIds = state.get('coins').keySeq().toArray();
    return {
      key: 'coinIds',
      value: JSON.stringify(coinIds)
    }
  });

  const sinks = {
    DOM: vdom$,
    HTTP: httpRequest$,
    Storage: storageRequest$
  };
  return sinks;
}
