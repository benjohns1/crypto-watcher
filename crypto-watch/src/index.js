import {run} from '@cycle/run'
import {makeDOMDriver} from '@cycle/dom'
import {makeHTTPDriver} from '@cycle/http'
import {timeDriver} from '@cycle/time'
import {App} from './app'

const main = App

const drivers = {
  DOM: makeDOMDriver('#root'),
  HTTP: makeHTTPDriver(),
  Time: timeDriver
}

run(main, drivers)
