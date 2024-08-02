import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";

import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse,
} from "aws-lambda";

const openSearchClient = new Client({
  ...AwsSigv4Signer({
    region: process.env.AWS_REGION!,
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
  node: process.env.OPENSEARCH_DOMAIN!,
});

export const handler = async (
  event: CloudFormationCustomResourceEvent
  // ): Promise<CloudFormationCustomResourceResponse> => {
): Promise<any> => {
  console.log("#####", event);
  console.log(
    await await openSearchClient.indices.exists({ index: "my-index" })
  );
  // switch (event.RequestType) {
  //   case "Create":
  //     console.log("Creating some resource");
  //   case "Update":
  //     console.log("Updating some resource");
  //   case "Delete":
  //     console.log("Updating some resource");
  // }

  return {
    Status: "SUCCESS",
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    StackId: event.StackId,
    PhysicalResourceId: "MyResourceId",
  };
};
