import {run} from '@cycle/run'
import {makeDOMDriver} from '@cycle/dom'
import {makeHTTPDriver} from '@cycle/http'
import {timeDriver} from '@cycle/time'
import storageDriver from '@cycle/storage'
import {App} from './app'

run(App, {
  DOM: makeDOMDriver('#root'),
  HTTP: makeHTTPDriver(),
  Storage: storageDriver,
  Time: timeDriver
});
