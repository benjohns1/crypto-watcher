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

  // Intent event streams
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
  return <div className="my-4">
    <h1>Crypto Watcher</h1>
    <p className="lead mb-4">Simplest way to watch your favorite cryptocurrencies</p>
    <div className="form-inline">
      <div className="form-group">
        <label for="addTokenInput" className="sr-only">Token or symbol</label>
        <input type="text" id="addTokenInput" className="autocomplete form-control" value={state.get('searchText')} placeholder="Token or symbol"></input>
      </div>
      <div className="form-group">
        <button className="addCoin btn btn-primary ml-sm-3">Add</button>
      </div>
    </div>
  </div>
}

const renderMessage = message => {
  if (!message) {
    return;
  }

  return <h2>{message}</h2>
}

const renderActionButton = (id, action, label) => <button className={action + " id-" + id + "  btn btn-sm btn-outline-danger"}>{label}</button>;

/**
 * Render coin table
 * @param {*} coins 
 */
const renderCoinTable = coins => {
  if (coins.size <= 0) {
    return <p>Not watching any coins! Add a token by name or ticker symbol.</p>
  }

  // Build table rows
  const tableRows = coins.reduce((rows, coin, id) => {

    if (!coin || !coin.get('id')) {
      return rows.push(<tr>
        <td className="d-none d-sm-block"></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td>{id} token not found</td>
        <td>{renderActionButton(id, "remove", "Remove")}</td>
      </tr>);
    }
    const hourlyChange = parseFloat(coin.get('percent_change_1h'));
    const dailyChange = parseFloat(coin.get('percent_change_24h'));
    const weeklyChange = parseFloat(coin.get('percent_change_7d'));
    return rows.push(<tr>
      <td className="d-none d-sm-block"><a href={"https://coinmarketcap.com/currencies/" + id} target="_blank">{coin.get('name')}</a></td>
      <td><a href={"https://coinmarketcap.com/currencies/" + id} target="_blank">{coin.get('symbol')}</a></td>
      <td className="text-right"><span className={"mr-sm-4" + (hourlyChange > 0 ? " text-success" : " text-danger")}>{hourlyChange.toFixed(2)}%</span></td>
      <td className="text-right"><span className={"mr-sm-4" + (dailyChange > 0 ? " text-success" : " text-danger")}>{dailyChange.toFixed(2)}%</span></td>
      <td className="text-right"><span className={"mr-sm-4" + (weeklyChange > 0 ? " text-success" : " text-danger")}>{weeklyChange.toFixed(2)}%</span></td>
      <td className="text-right"><span className="mr-sm-4">${parseFloat(coin.get('price_usd')).toFixed(2)}</span></td>
      <td className="text-right"><span className="mr-sm-4">{parseFloat(coin.get('price_btc')).toFixed(8)}</span></td>
      <td></td>
      <td>{renderActionButton(id, "remove", "Remove")}</td>
    </tr>);
  }, Immutable.List());

  // Add table header and insert rows into template
  return <table className="table table-striped table-sm">
    <thead>
      <tr>
        <th scope="col" className="d-none d-sm-block">Name</th>
        <th scope="col">Symbol</th>
        <th scope="col" className="text-right"><span className="mr-sm-4">1h Change</span></th>
        <th scope="col" className="text-right"><span className="mr-sm-4">24h Change</span></th>
        <th scope="col" className="text-right"><span className="mr-sm-4">7d Change</span></th>
        <th scope="col" className="text-right"><span className="mr-sm-4">USD</span></th>
        <th scope="col" className="text-right"><span className="mr-sm-4">BTC</span></th>
        <th scope="col"></th>
        <th scope="col">Actions</th>
      </tr>
    </thead>
    <tbody>
      {tableRows.toArray()}
    </tbody>
  </table>
}

/**
 * Render main app view
 * @param {*} state$ 
 */
const view = state$ => state$.map(state => {
  return <div>
    <main className="container">
      {renderHeader(state)}
      {state.get('loading') ? renderMessage(state.get('message')) : renderCoinTable(state.get('coins'))}
    </main>
    <footer className="footer text-muted font-weight-light">
      <div className="container">
        <div className="row">
          <div className="col-md">
            <p>About this app
              <ul>
                <li>Your personal list is saved locally, it is <em>not</em> transmitted over the wire</li>
                <li>Prices are auto-updated from <a href="https://coinmarketcap.com/">coinmarketcap</a> every 5 minutes</li>
                <li>Available tokens are currently limited to the top 100</li>
                <li><a href="https://github.com/benjohns1/crypto-watch">Github</a> - built with <a href="https://cycle.js.org/">Cycle.js</a>, <a href="https://facebook.github.io/immutable-js/">Immutable.js</a> and <a href="https://getbootstrap.com/">Bootstrap 4</a></li>
              </ul>
            </p>
          </div>
          <div className="col-md">
            <p>Donate &#9786;<br/>
            BTC: 38NF99xwLwbGvtqZSzzBG3d5LbzNEX3hAS<br/>
            ETH: 0xd48C957E59b7b1C20787c6eb6f7A8b82151b3a50<br/>
            LTC: MWqT3GCZVWi1LcDLBhMTgXqyXEBYtwt7Fb</p>
            <p>Copyright &copy; 2017 Ben Johns | <a href="https://en.wikipedia.org/wiki/MIT_License">MIT</a></p>
          </div>
        </div>
      </div>
    </footer>
  </div>
});

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
      return state.set('message', ticker).set('loading', true);
    }

    // For all coins, (re)populate their values from ticker data
    const coins = state.get('coins').map((coin, id) => {
      return ticker.find(item => matchCoin(id, item));
    });

    // Return state with updated coins and ticker data
    return state.set('message', null).set('coins', coins).set('ticker', ticker).set('loading', false);
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

  const reducer$ = xs.merge(tickerReducer$, addCoinReducer$, removeCoinReducer$, storedCoinIdsReducer$, inputTextReducer$);

  const state$ = reducer$.fold((state, reducer) => reducer(state), Immutable.Map({
    coins: Immutable.OrderedMap(),
    ticker: Immutable.List(),
    message: null,
    loading: false,
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
