import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse,
} from "aws-lambda";

export const handler = async (
  event: CloudFormationCustomResourceEvent
): Promise<CloudFormationCustomResourceResponse> => {
  console.log("#####", event);
  switch (event.RequestType) {
    case "Create":
      console.log("Creating some resource");
    case "Update":
      console.log("Updating some resource");
    case "Delete":
      console.log("Updating some resource");
  }

  return {
    Status: "SUCCESS",
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    StackId: event.StackId,
    PhysicalResourceId: "MyResourceId",
  };
};
