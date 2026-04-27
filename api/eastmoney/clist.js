import { handleEastMoneyRequest } from './_bridge.js'

export default function handler(req, res) {
  return handleEastMoneyRequest(req, res, 'quote')
}
