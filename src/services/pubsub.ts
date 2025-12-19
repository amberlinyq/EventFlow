import { PubSub } from '@google-cloud/pubsub';
import { env } from '../config/env';
import { logger } from '../utils/logger';

class PubSubService {
  private client: PubSub;
  private topic: ReturnType<PubSub['topic']> | null = null;

  constructor() {
    const options: { projectId: string; keyFilename?: string } = {
      projectId: env.GCP_PROJECT_ID,
    };

    if (env.GCP_CREDENTIALS_PATH) {
      options.keyFilename = env.GCP_CREDENTIALS_PATH;
    }

    this.client = new PubSub(options);
  }

  async initialize(): Promise<void> {
    try {
      const [topic] = await this.client.topic(env.PUBSUB_TOPIC_NAME).get({ autoCreate: true });
      this.topic = topic;
      logger.info({ topic: env.PUBSUB_TOPIC_NAME }, 'Pub/Sub topic initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Pub/Sub topic');
      throw error;
    }
  }

  async publishEvent(eventId: string): Promise<string> {
    if (!this.topic) {
      await this.initialize();
    }

    try {
      const messageId = await this.topic!.publishMessage({
        json: { eventId },
      });
      logger.info({ eventId, messageId }, 'Event published to Pub/Sub');
      return messageId;
    } catch (error) {
      logger.error({ error, eventId }, 'Failed to publish event to Pub/Sub');
      throw error;
    }
  }

  getSubscription() {
    return this.client.subscription(env.PUBSUB_SUBSCRIPTION_NAME);
  }

  async createSubscriptionIfNotExists(): Promise<void> {
    try {
      const subscription = this.getSubscription();
      const [exists] = await subscription.exists();
      
      if (!exists) {
        const [topic] = await this.client.topic(env.PUBSUB_TOPIC_NAME).get({ autoCreate: true });
        await this.client.createSubscription(topic, env.PUBSUB_SUBSCRIPTION_NAME);
        logger.info({ subscription: env.PUBSUB_SUBSCRIPTION_NAME }, 'Pub/Sub subscription created');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to create Pub/Sub subscription');
      throw error;
    }
  }
}

export const pubsubService = new PubSubService();

