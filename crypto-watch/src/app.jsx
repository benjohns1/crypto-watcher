import xs from 'xstream'
import {h1, h2, div, select, button, table, th, tr, td} from '@cycle/dom'

const log = val =>  { console.log(val); return val; };

export function App (sources) {
  const request$ = xs.of({
    url: 'https://api.coinmarketcap.com/v1/ticker/',
    category: 'ticker'
  });
  let response$ = sources.HTTP.select('ticker').flatten();

  const coinUpdate$ = xs.of(
    {
      "id": "bitcoin",
      "action": "add",
    },
    {
      "id": "ethereum",
      "action": "add"
    }
  );

  const coins$ = coinUpdate$.fold((coins, event) => {
    if (event.action === "add") {
      if (coins.findIndex(coin => coin.id === event.id) >= 0) {
        return coins;
      }
      coins.push({
        "id": event.id
      });
    }
    else if (event.action === "remove") {
      coins = coins.filter(coin => coin.id !== event.id);
    }
    return coins;
  }, []);

  const data$ = response$.map(res => {
    if (!res.ok) {
      return res.statusCode + ": " + statusText;
    }
    return JSON.parse(res.text);
  }).startWith("Loading...");

  const vdom$ = xs.combine(coins$, data$).map(([coins, data]) => {
    let domOutput = [
      h1('Crypto Watcher')
    ];
    if (!Array.isArray(data)) {
      domOutput.push(h2(data));
      return div(domOutput);
    }

    let tableRows = coins.map(coin => {
      let coinDetails = data.find(detail => detail.id === coin.id);
      return tr([
        td(coin.id),
        td(coinDetails ? coinDetails.symbol : ''),
        td(coinDetails ? coinDetails.price_usd : ''),
        td(coinDetails ? coinDetails.price_btc : '')
    ])});
    tableRows.unshift(tr([
      th('ID'),
      th('Symbol'),
      th('USD'),
      th('BTC')
    ]));
    domOutput.push(table('.currencyData', tableRows));
    return div(domOutput);
  });

  const sinks = {
    DOM: vdom$,
    HTTP: request$
  };
  return sinks
}
