import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Client } from "@opensearch-project/opensearch";
import { IndicesIndexSettings } from "@opensearch-project/opensearch/api/types";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";

interface EmbeddingModelInfo {
  dimension: number;
  provider: string;
}

const bedrockEmbeddingModels: Record<string, EmbeddingModelInfo> = {
  "amazon.titan-embed-text-v1": { dimension: 1536, provider: "Amazon" },
  "amazon.titan-embed-image-v1": { dimension: 1024, provider: "Amazon" },
  "amazon.titan-embed-g1-text-02": { dimension: 1536, provider: "Amazon" },
  "amazon.titan-embed-g1-text-01": { dimension: 4096, provider: "Amazon" },
  "cohere.embed-english-v3": { dimension: 1024, provider: "Cohere" },
  "cohere.embed-multilingual-v3": { dimension: 1024, provider: "Cohere" },
};

import { CloudFormationCustomResourceEvent } from "aws-lambda";
import * as env from "env-var";

const MODEL_ID = env.get("MODEL_ID").required().asString();
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
  // ): Promise<CloudFormationCustomResourceResponse> => {
): Promise<any> => {
  console.log("#####", event);
  if (
    await (
      await openSearchClient.indices.exists({ index: "my-index" })
    ).body
  ) {
    console.log("Index already exists");
    await openSearchClient.indices.delete({ index: "my-index" });
  }

  const { dimension } = bedrockEmbeddingModels[MODEL_ID];
  console.log("Creating index with vecotr length: ", dimension);
  return await openSearchClient.indices.create({
    index: "my-index",
    body: {
      settings: {
        index: {
          knn: true,
        },
      },
      mappings: {
        properties: {
          AMAZON_BEDROCK_METADATA: {
            type: "text",
            index: false,
          },
          AMAZON_BEDROCK_TEXT_CHUNK: {
            type: "text",
            index: true,
          },
          "bedrock-knowledge-base-default-vector": {
            type: "knn_vector",
            dimension: 1024,
            method: {
              name: "hnsw",
              space_type: "l2",
              engine: "faiss",
              // parameters: {
              //   ef_construction: 512,
              //   m: 16,
              // },
            },
            // type: "knn_vector",
            // dimension: dimension,
            // engine: "faiss",
            // space_type: "l2",
            // name: "hnsw",
            // parameters: {},
          },
        },
      },
    },
  });
  // switch (event.RequestType) {
  //   case "Create":
  //     console.log("Creating some resource");
  //   case "Update":
  //     console.log("Updating some resource");
  //   case "Delete":
  //     console.log("Updating some resource");
  // }

  //   Status: "SUCCESS",
  //   RequestId: event.RequestId,
  //   LogicalResourceId: event.LogicalResourceId,
  //   StackId: event.StackId,
  //   PhysicalResourceId: "MyResourceId",
  // };
};
