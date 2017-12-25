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

  // Raw DOM selector events
  const input$ = DOM.select(acSelector).events('input');
  const keydown$ = DOM.select(acSelector).events('keydown');

  // Intermediate event streams
  const enterPressed$ = keydown$.compose(Time.debounce(1)).filter(({keyCode}) => keyCode === KEY_ENTER);

  // Compose intent streams
  const search$ = input$.compose(Time.debounce(100)).map(ev => ev.target.value).filter(search => search.length > 0).startWith('');

  // Combine intents into actions object
  return {
    search$: search$,
    addCoin$: addCoinStream(enterPressed$, search$),
    removeCoin$: removeCoinStream()
  }
};

/**
 * Build stream of actions to add coins to watch list
 */
const addCoinStream = (enterPressed$, search$) => {

  const addCoinEvent$ = enterPressed$.mapTo(xs.of(true, false)).flatten();

  const initialCoins$ = xs.of("bitcoin", "ethereum");
  const addCoinAction$ = xs.combine(addCoinEvent$, search$).filter(([addCoinEvent]) => addCoinEvent).map(([addCoinEvent, search]) => search);

  return xs.merge(initialCoins$, addCoinAction$);
};

/**
 * Build stream of actions to remove coins from list
 */
const removeCoinStream = () => {

  return xs.empty();
};

/**
 * Render page header
 */
const renderHeader = () => <div>
  <h1>Crypto Watcher</h1>
  <input type="text" className="autocomplete"></input>
</div>

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
    const coinName = coin.get('name');
    return rows.push(<tr>
      <td>{coinName ? coinName : id}</td>
      <td>{coin.get('symbol')}</td>
      <td>${coin.get('price_usd')}</td>
      <td>{coin.get('price_btc')}</td>
    </tr>);
  }, Immutable.List());

  // Add table header and insert rows into template
  return <table>
    <tr>
      <th>Name</th>
      <th>Symbol</th>
      <th>USD</th>
      <th>BTC</th>
    </tr>
    {tableRows.toArray()}
  </table>
}

/**
 * Render main app view
 * @param {*} state$ 
 */
const view = state$ => state$.map(state => {
  return <div>
    {renderHeader()}
    {renderMessage(state.get('message'))}
    {renderCoinTable(state.get('coins'))}
  </div>
});

/**
 * Given actions and data streams, define new state stream
 * @param {*} ticker$ 
 * @param {*} actions 
 */
const model = (ticker$, actions) => {

  // Ticker data
  const data$ = ticker$.map(res => {
    if (!res.ok) {
      return res.statusCode + ": " + statusText;
    }
    return Immutable.List(JSON.parse(res.text));
  }).startWith("Loading...");

  const addCoinReducer$ = actions.addCoin$.map(coinToAdd => state => {

    const coins = state.get('coins');

    // Check if coin already exists
    if (coins.has(coinToAdd)) {
      return state;
    }

    // Try to find new coin in ticker data
    const newCoin = state.get('ticker').find(item => item.id === coinToAdd);
    const newCoins = coins.set(newCoin ? newCoin.id : coinToAdd, Immutable.Map(newCoin));
    return state.set('coins', newCoins);
  });

  const removeCoinReducer$ = actions.removeCoin$.map(coinToRemove => state => {
    // Remove any coins that match
    const coins = state.get('coins').filter((coin, id) => id !== coinToRemove);
    return state.set('coins', coins);
  });

  const tickerReducer$ = data$.map(ticker => state => {

    // If ticker doesn't have data yet, print its value as a message
    if (!Immutable.List.isList(ticker)) {
      return state.set('message', ticker);
    }

    // If there are any coins, (re)populate their values from ticker data
    const coins = state.get('coins').map((coin, id) => {
      return Immutable.Map(ticker.find(item => item.id === id))
    });

    // Return state with updated coins and ticker data
    return state.set('message', null).set('coins', coins).set('ticker', ticker);
  });

  const reducer$ = xs.merge(addCoinReducer$, removeCoinReducer$, tickerReducer$);

  const state$ = reducer$.fold((state, reducer) => reducer(state), Immutable.Map({
    coins: Immutable.OrderedMap(),
    ticker: Immutable.List(),
    message: null
  }));

  return state$;
}

export function App (sources) {

  // Make HTTP ticker request immediately
  const request$ = xs.of({
    url: 'https://api.coinmarketcap.com/v1/ticker/',
    category: 'ticker'
  });

  // HTTP ticker response event
  const ticker$ = sources.HTTP.select('ticker').flatten();

  // MVI
  const actions = intent(sources.DOM, sources.Time);
  const state$ = model(ticker$, actions);
  const vdom$ = view(state$);

  const sinks = {
    DOM: vdom$,
    HTTP: request$
  };
  return sinks;
}
