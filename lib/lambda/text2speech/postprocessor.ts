import { SNSEvent } from "aws-lambda";

export const handler = async (event: SNSEvent) => {
  console.info("Start processing event", { event });

  event.Records.forEach(async (record) => {
    console.info("Received record of event", { message: record.Sns.Message });
  });
  return;
};
