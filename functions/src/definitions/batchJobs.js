const functions = require("firebase-functions")
const admin = require("firebase-admin")
const { sendWhatsappTemplateMessage } = require("./common/sendWhatsappMessage")
const {
  respondToInstance,
  sendInterimPrompt,
} = require("./common/responseUtils")
const { Timestamp } = require("firebase-admin/firestore")
const { getCount } = require("./common/counters")
const { getThresholds } = require("./common/utils")
const { defineString } = require("firebase-functions/params")
const runtimeEnvironment = defineString("ENVIRONMENT")

if (!admin.apps.length) {
  admin.initializeApp()
}

async function deactivateAndRemind(context) {
  try {
    const db = admin.firestore()
    const cutoffHours = 72
    const activeCheckMatesSnap = await db
      .collection("factCheckers")
      .where("isActive", "==", true)
      .get()
    const promisesArr = activeCheckMatesSnap.docs.map(async (doc) => {
      const lastVotedTimestamp =
        doc.get("lastVotedTimestamp") ?? Timestamp.fromDate(new Date(0))
      const factCheckerId = doc.id
      const lastVotedDate = lastVotedTimestamp.toDate()
      //set cutoff to 72 hours ago
      const cutoffDate = new Date(Date.now() - cutoffHours * 60 * 60 * 1000)
      const cutoffTimestamp = Timestamp.fromDate(cutoffDate)
      const voteRequestsQuerySnap = await db
        .collectionGroup("voteRequests")
        .where("platformId", "==", factCheckerId)
        .where("createdTimestamp", "<", cutoffTimestamp)
        .where("category", "==", null)
        .get()
      if (!voteRequestsQuerySnap.empty && lastVotedDate < cutoffDate) {
        functions.logger.log(
          `${factCheckerId}, ${doc.get("name")} set to inactive`
        )
        await doc.ref.update({ isActive: false })
        return sendWhatsappTemplateMessage(
          "factChecker",
          factCheckerId,
          "deactivation_notification",
          "en",
          [doc.get("name") || "CheckMate", `${cutoffHours}`],
          [`${factCheckerId}`]
        )
      }
    })
    await Promise.all(promisesArr)
  } catch (error) {
    functions.logger.error("Error in deactivateAndRemind:", error)
  }
}

async function checkConversationSessionExpiring(context) {
  try {
    const db = admin.firestore()
    const hoursAgo = 23
    const windowStart = Timestamp.fromDate(
      new Date(Date.now() - hoursAgo * 60 * 60 * 1000)
    )
    const windowEnd = Timestamp.fromDate(
      new Date(Date.now() - (hoursAgo + 1) * 60 * 60 * 1000)
    )
    const unrepliedInstances = await db
      .collectionGroup("instances")
      .where("isReplied", "==", false)
      .where("timestamp", "<=", windowStart) //match all those earlier than 23 hours ago
      .where("timestamp", ">", windowEnd) //and all those later than 24 hours ago
      .get()
    const promisesArr = unrepliedInstances.docs.map(async (doc) => {
      return respondToInstance(doc, true)
    })
    await Promise.all(promisesArr)
  } catch (error) {
    functions.logger.error("Error in checkConversationSessionExpiring:", error)
  }
}

async function interimPromptHandler(context) {
  try {
    const db = admin.firestore()
    const dayAgo = Timestamp.fromDate(
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    )
    const halfHourAgo =
      runtimeEnvironment.value() === "PROD"
        ? Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000))
        : Timestamp.fromDate(new Date())
    const thresholds = await getThresholds()
    const eligibleInstances = await db
      .collectionGroup("instances")
      .where("isReplied", "==", false) //match all those that haven't been replied to
      .where("timestamp", ">", dayAgo) //and came in later than 24 hours ago
      .where("timestamp", "<=", halfHourAgo) //but also at least 30 minutes ago
      .where("isInterimPromptSent", "==", null) //and for which we haven't sent the interim yet
      .get()
    const promisesArr = eligibleInstances.docs.map(async (doc) => {
      const parentMessageRef = doc.ref.parent.parent
      const voteCount = await getCount(parentMessageRef, "responses")
      if (
        voteCount >= runtimeEnvironment.value() === "PROD"
          ? thresholds.sendInterimMinVotes
          : 1
      ) {
        return sendInterimPrompt(doc)
      } else {
        return Promise.resolve()
      }
    })
    await Promise.all(promisesArr)
  } catch (error) {
    functions.logger.error("Error in interimPromptHandler:", error)
  }
}

exports.checkSessionExpiring = functions
  .region("asia-southeast1")
  .runWith({ secrets: ["WHATSAPP_USER_BOT_PHONE_NUMBER_ID", "WHATSAPP_TOKEN"] })
  .pubsub.schedule("1 * * * *")
  .timeZone("Asia/Singapore")
  .onRun(checkConversationSessionExpiring)

exports.scheduledDeactivation = functions
  .region("asia-southeast1")
  .runWith({
    secrets: ["WHATSAPP_CHECKERS_BOT_PHONE_NUMBER_ID", "WHATSAPP_TOKEN"],
  })
  .pubsub.schedule("11 20 * * *")
  .timeZone("Asia/Singapore")
  .onRun(deactivateAndRemind)

exports.sendInterimPrompt = functions
  .region("asia-southeast1")
  .runWith({ secrets: ["WHATSAPP_USER_BOT_PHONE_NUMBER_ID", "WHATSAPP_TOKEN"] })
  .pubsub.schedule("*/20 * * * *")
  .timeZone("Asia/Singapore")
  .onRun(interimPromptHandler)

exports.interimPromptHandler = interimPromptHandler
