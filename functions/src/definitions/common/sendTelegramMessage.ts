import axios from "axios"
import * as functions from "firebase-functions"
import FormData from "form-data"

const telegramHost =
  process.env["TEST_SERVER_URL"] || "https://api.telegram.org" //only exists in integration test environment

const sendTelegramTextMessage = async function (
  bot: string,
  to: string,
  text: string,
  replyId = null
) {
  let token
  let data: { chat_id: string; text: string; reply_to_message_id?: string }
  if (bot == "factChecker") {
    token = process.env.TELEGRAM_CHECKER_BOT_TOKEN
  } else if (bot === "report") {
    token = process.env.TELEGRAM_REPORT_BOT_TOKEN
  } else {
    token = process.env.TELEGRAM_USER_BOT_TOKEN
  }
  data = {
    chat_id: to,
    text: text,
  }
  if (replyId) {
    data.reply_to_message_id = replyId
  }
  const response = await axios({
    method: "POST", // Required, HTTP method, a string, e.g. POST, GET
    url: `${telegramHost}/bot${token}/sendMessage`,
    data: data,
    headers: {
      "Content-Type": "application/json",
    },
  }).catch((error) => {
    functions.logger.log(error.response)
    throw "error with sending telegram message"
  })
  return response
}

const sendTelegramImageMessage = async function (
  bot: string,
  to: string,
  url: string,
  caption: string,
  replyId = null
) {
  let token
  let data: {
    chat_id: string
    photo: string
    caption?: string
    reply_to_message_id?: string
  }
  if (bot == "factChecker") {
    token = process.env.TELEGRAM_CHECKER_BOT_TOKEN
  } else {
    token = process.env.TELEGRAM_USER_BOT_TOKEN
  }
  data = {
    chat_id: to,
    photo: url,
  }
  if (caption) {
    data.caption = caption
  }
  if (replyId) {
    data.reply_to_message_id = replyId
  }
  const response = await axios({
    method: "POST", // Required, HTTP method, a string, e.g. POST, GET
    url: `https://api.telegram.org/bot${token}/sendMessage`,
    data: data,
    headers: {
      "Content-Type": "application/json",
    },
  }).catch((error) => {
    functions.logger.log(error.response)
    throw "error with sending telegram photo"
  })
  return response
}

const sendTelegramImageMessageImageStream = async function (
  bot: string,
  to: string,
  imageStream: string,
  caption: string,
  replyId = null
) {
  let token
  if (bot == "factChecker") {
    token = process.env.TELEGRAM_CHECKER_BOT_TOKEN
  } else {
    token = process.env.TELEGRAM_USER_BOT_TOKEN
  }
  const formData = new FormData()
  formData.append("chat_id", to)
  formData.append("photo", imageStream)
  if (caption) {
    formData.append("caption", caption)
  }
  if (replyId) {
    formData.append("reply_to_message_id", replyId)
  }
  const response = await axios({
    method: "POST", // Required, HTTP method, a string, e.g. POST, GET
    url: `https://api.telegram.org/bot${token}/sendPhoto`,
    data: formData,
    headers: formData.getHeaders(),
  }).catch((error) => {
    functions.logger.log(error.response)
    throw "error with sending telegram photo"
  })
  return response
}

export {
  sendTelegramImageMessageImageStream,
  sendTelegramTextMessage,
  sendTelegramImageMessage,
}
