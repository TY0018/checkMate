import admin from "firebase-admin"
import functions from "firebase-functions"
import { USER_BOT_RESPONSES, FACTCHECKER_BOT_RESPONSES } from "./constants"
import {
  sendWhatsappButtonMessage,
  sendWhatsappTextListMessage,
} from "./sendWhatsappMessage"
import { DocumentSnapshot, Timestamp } from "firebase-admin/firestore"
import { getThresholds } from "./utils"

function getInfoLiner(truthScore: null | number) {
  return `, with an average score of ${
    typeof truthScore === "number" ? truthScore.toFixed(2) : "NA"
  } on a scale of 0-5 (5 = completely true)`
}

async function respondToInterimFeedback(
  instancePath: string,
  isUseful: string
) {
  const db = admin.firestore()
  const instanceRef = db.doc(instancePath)
  const instanceSnap = await instanceRef.get()
  const responses = await getResponsesObj("user")
  const data = instanceSnap.data()
  if (!data) {
    functions.logger.log("Missing data in respondToInterimFeedback")
    return
  }
  const buttons = [
    {
      type: "reply",
      reply: {
        id: `sendInterim_${instancePath}`,
        title: "Get another update",
      },
    },
  ]
  let response
  switch (isUseful) {
    case "yes":
      response = responses?.INTERIM_USEFUL
      await instanceRef.update({ isInterimUseful: true })
      break
    default:
      response = responses?.INTERIM_NOT_USEFUL
      await instanceRef.update({ isInterimUseful: false })
      break
  }

  await sendWhatsappButtonMessage("user", data.from, response, buttons, data.id)
}

async function getResponsesObj(
  botType: "factChecker"
): Promise<typeof FACTCHECKER_BOT_RESPONSES>
async function getResponsesObj(
  botType: "user"
): Promise<typeof USER_BOT_RESPONSES>
async function getResponsesObj(botType: "user" | "factChecker" = "user") {
  const db = admin.firestore()
  let path
  let fallbackResponses
  if (botType === "factChecker") {
    path = "systemParameters/factCheckerBotResponses"
    fallbackResponses = FACTCHECKER_BOT_RESPONSES
  } else {
    path = "systemParameters/userBotResponses"
    fallbackResponses = USER_BOT_RESPONSES
  }
  const defaultResponsesRef = db.doc(path)
  const defaultResponsesSnap = await defaultResponsesRef.get()
  return defaultResponsesSnap.data() ?? fallbackResponses
}

async function sendMenuMessage(
  to: string,
  prefixName: string,
  platform = "whatsapp",
  replyMessageId = null,
  disputedInstancePath = null
) {
  const responses = await getResponsesObj("user")
  if (!(prefixName in responses)) {
    functions.logger.error(`prefixName ${prefixName} not found in responses`)
    return
  }
  const text = responses.MENU.replace(
    "{{prefix}}",
    responses[prefixName as keyof typeof responses]
  )
  switch (platform) {
    case "telegram":
      functions.logger.warn("Telegram menu not implemented yet")
      break
    case "whatsapp":
      const type = "menu"
      const rows = [
        {
          id: `${type}_check`,
          title: "Check/Report",
          description: "Send in messages, images, or screenshots for checking!",
        },
        {
          id: `${type}_help`,
          title: "Get Help",
          description:
            "Find out how to use CheckMate to check or report dubious messages",
        },
        {
          id: `${type}_about`,
          title: "About CheckMate",
          description: "Learn more about CheckMate and the team behind it",
        },
        {
          id: `${type}_feedback`,
          title: "Send Feedback",
          description: "Send us feedback on anything to do with CheckMate",
        },
        {
          id: `${type}_contact`,
          title: "Get Contact",
          description: "Get CheckMates contact to add to your contact list",
        },
        //TODO: Implement these next time
        // {
        //   id: `${type}_newsletter`,
        //   title: "Get Newsletter",
        //   description: "Get our newsletter on the latest scams, hoaxes and misinformation",
        // },
        // {
        //   id: `${type}_tips`,
        //   title: "Get Tips",
        //   description: "Get tips on how to spot scams, hoaxes and misinformation",
        // },
        // {
        //   id: `${type}_stats`,
        //   title: "See My Stats",
        //   description: "View your latest stats and how you've contributed!",
        // },
      ]
      if (disputedInstancePath) {
        rows.splice(4, 0, {
          id: `${type}_dispute_${disputedInstancePath}`,
          title: "Dispute Assessment",
          description: "Dispute CheckMate's assesment of this message",
        })
      }
      const sections = [
        {
          rows: rows,
        },
      ]
      await sendWhatsappTextListMessage(
        "user",
        to,
        text,
        "View Menu",
        sections,
        replyMessageId
      )
      break
  }
}

async function sendSatisfactionSurvey(instanceSnap: DocumentSnapshot) {
  const db = admin.firestore()
  const data = instanceSnap.data()
  if (!data) {
    return
  }
  const responses = await getResponsesObj("user")
  const isSatisfactionSurveySent = instanceSnap.get("isSatisfactionSurveySent")
  const userRef = db.collection("users").doc(data.from)
  const thresholds = await getThresholds()
  const cooldown = thresholds.satisfactionSurveyCooldownDays ?? 30
  const userSnap = await userRef.get()
  const lastSent = userSnap.get("satisfactionSurveyLastSent")
  //check lastSent is more than cooldown days ago
  let cooldownDate = new Date()
  cooldownDate.setDate(cooldownDate.getDate() - cooldown)
  if (
    !isSatisfactionSurveySent &&
    (!lastSent || lastSent.toDate() < cooldownDate)
  ) {
    const rows: { id: string; title: string; description?: string }[] =
      Array.from({ length: 10 }, (_, i) => {
        const number = 10 - i
        return {
          id: `satisfactionSurvey_${number}_${instanceSnap.ref.path}`,
          title: `${number}`,
        }
      })
    rows[0].description = "Extremely likely 🤩"
    rows[9].description = "Not at all likely 😥"
    const sections = [
      {
        rows: rows,
      },
    ]
    await sendWhatsappTextListMessage(
      "user",
      data.from,
      responses.SATISFACTION_SURVEY,
      "Tap to respond",
      sections
    )
    const batch = db.batch()
    batch.update(instanceSnap.ref, {
      isSatisfactionSurveySent: true,
    })
    batch.update(userRef, {
      satisfactionSurveyLastSent: Timestamp.fromDate(new Date()),
    })
    await batch.commit()
  }
}

export {
  getInfoLiner,
  respondToInterimFeedback,
  getResponsesObj,
  sendMenuMessage,
  sendSatisfactionSurvey,
}
