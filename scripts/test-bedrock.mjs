/**
 * Verifies the Bedrock client's real behavior against AWS:
 * - a valid embedding model returns a vector (if model access is enabled)
 * - an invalid model id fails gracefully
 *
 * Run: node scripts/test-bedrock.mjs
 */
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "us-east-1" });

async function tryInvoke(modelId) {
  try {
    const res = await client.send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({ inputText: "Lost black wallet at the library" }),
      }),
    );
    const parsed = JSON.parse(new TextDecoder().decode(res.body));
    return { ok: true, dims: parsed.embedding?.length };
  } catch (err) {
    return { ok: false, name: err.name, message: String(err.message).slice(0, 100) };
  }
}

console.log("titan-embed-text-v2:", JSON.stringify(await tryInvoke("amazon.titan-embed-text-v2:0")));
console.log("invalid-model-id:  ", JSON.stringify(await tryInvoke("invalid.model.id")));
