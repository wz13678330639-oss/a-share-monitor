import { handleEastMoneyRequest } from '../_bridge.js'

export default function onRequest(context) {
  return handleEastMoneyRequest(context, 'quote')
}
