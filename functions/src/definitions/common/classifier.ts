import { getL1Category } from "./machineLearningServer/operations"

async function classifyText(text: string): Promise<string | null> {
  //longer term, should classify into "irrelevant", "legitimate", "scam", "illicit", "spam", or "info". null if cannot
  if (text.length < 10) {
    return "irrelevant"
  }
  const category = await getL1Category(text)
  if (category === "trivial") {
    return "irrelevant"
  } else {
    return category
  }
}

export { classifyText }
