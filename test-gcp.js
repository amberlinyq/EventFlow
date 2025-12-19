import { PubSub } from "@google-cloud/pubsub";
import dotenv from "dotenv";

dotenv.config(); // loads .env

const pubsub = new PubSub({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GCP_CREDENTIALS_PATH
});

async function test() {
  try {
    const [topics] = await pubsub.getTopics();
    console.log("✅ GCP connection works! Found topics:", topics.map(t => t.name));
  } catch (err) {
    console.error("❌ GCP connection failed:", err);
  }
}

test();
