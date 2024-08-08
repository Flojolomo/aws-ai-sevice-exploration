import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";

interface EmbeddingModelInfo {
  dimension: number;
  provider: string;
}

interface IndexConfiguration {
  VECTOR_FIELD: string;
  DIMENSION: number;
  MAPPING_FIELD_TEXT_CHUNK: string;
  MAPPING_FIELD_METADATA: string;
}

const bedrockEmbeddingModels: Record<string, EmbeddingModelInfo> = {
  "amazon.titan-embed-text-v1": { dimension: 1536, provider: "Amazon" },
  "amazon.titan-embed-image-v1": { dimension: 1024, provider: "Amazon" },
  "amazon.titan-embed-g1-text-02": { dimension: 1536, provider: "Amazon" },
  "amazon.titan-embed-g1-text-01": { dimension: 4096, provider: "Amazon" },
  "cohere.embed-english-v3": { dimension: 1024, provider: "Cohere" },
  "cohere.embed-multilingual-v3": { dimension: 1024, provider: "Cohere" },
};

import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse,
} from "aws-lambda";
import * as env from "env-var";

// const MODEL_ID = env.get("MODEL_ID").required().asString();
const OPENSEARCH_DOMAIN = env.get("OPENSEARCH_DOMAIN").required().asString();
const AWS_REGION = env.get("AWS_REGION").required().asString();

const openSearchClient = new Client({
  ...AwsSigv4Signer({
    region: AWS_REGION,
    service: "aoss", // 'aoss' for OpenSearch Serverless
    // Must return a Promise that resolve to an AWS.Credentials object.
    // This function is used to acquire the credentials when the client start and
    // when the credentials are expired.
    // The Client will refresh the Credentials only when they are expired.
    // With AWS SDK V2, Credentials.refreshPromise is used when available to refresh the credentials.

    // Example with AWS SDK V3:
    getCredentials: () => {
      // Any other method to acquire a new Credentials object can be used.
      const credentialsProvider = defaultProvider();
      return credentialsProvider();
    },
  }),
  node: OPENSEARCH_DOMAIN,
});

export const handler = async (
  event: CloudFormationCustomResourceEvent
): Promise<CloudFormationCustomResourceResponse> => {
  console.log("#####", event);

  const indexName = event.ResourceProperties.INDEX_NAME;
  const deleteOldIndices = event.ResourceProperties.DELETE_OLD_INDICES;
  const indexConfiguration = event.ResourceProperties.INDEX_CONFIGURATION;

  if (!indexName) {
    throw new Error("Missing INDEX_NAME in ResourceProperties");
  }

  if (deleteOldIndices === undefined) {
    throw new Error("Missing DELETE_OLD_INDICES in ResourceProperties");
  }

  if (!indexConfiguration) {
    throw new Error("Missing INDEX_CONFIGURATION in ResourceProperties");
  }

  await verifyIndexExists(indexName, indexConfiguration);
  if (deleteOldIndices) {
    await deleteStaleIndices(indexName);
  }

  return {
    Status: "SUCCESS",
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    StackId: event.StackId,
    PhysicalResourceId: "MyResourceId", // TODO
  };
};

async function createIndex(
  name: string,
  indexConfiguration: IndexConfiguration
) {
  await openSearchClient.indices.create({
    index: name,
    body: {
      settings: {
        index: {
          knn: true,
        },
      },
      mappings: {
        properties: {
          [indexConfiguration.MAPPING_FIELD_METADATA]: {
            type: "text",
            index: false,
          },
          [indexConfiguration.MAPPING_FIELD_TEXT_CHUNK]: {
            type: "text",
            index: true,
          },
          [indexConfiguration.VECTOR_FIELD]: {
            type: "knn_vector",
            dimension: Number(indexConfiguration.DIMENSION),
            method: {
              name: "hnsw",
              space_type: "l2",
              engine: "faiss",
            },
          },
        },
      },
    },
  });
}

async function verifyIndexExists(
  indexName: string,
  indexConfiguration: IndexConfiguration
) {
  const indexExists = await (
    await openSearchClient.indices.exists({ index: indexName })
  ).body;
  if (!indexExists) {
    console.log("Creating index ", indexConfiguration);

    await createIndex(indexName, indexConfiguration);
    console.log("Index created");
  }

  console.log("Index exists");
}

async function deleteStaleIndices(currentIndexName: string) {
  console.log("Deleting stale indices");
  const indices = (await openSearchClient.cat.indices({ format: "json" })).body;
  await Promise.all(
    indices.map(async ({ index }: { index: string }) => {
      if (index === currentIndexName) {
        return;
      }

      console.log("Deleting index: ", index);
      await openSearchClient.indices.delete({ index: index });
    })
  );
}
