import * as env from "env-var";

const KNOWLEDGEBASE_ID = env.get("KNOWLEDGEBASE_ID").required().asString();
const AWS_REGION = env.get("AWS_REGION").required().asString();

import * as kbr from "@aws-sdk/client-bedrock-agent-runtime";

const bedrockClient = new kbr.BedrockAgentRuntimeClient({});

export const handler = async (event: unknown) => {
  console.info("Start processing event", { event });

  const retrieveParams: kbr.RetrieveCommandInput = {
    knowledgeBaseId: KNOWLEDGEBASE_ID,
    retrievalQuery: {
      text: (event as any).query,
    },
  };

  console.log("Sending retrieve command", retrieveParams);
  const response = await bedrockClient.send(
    new kbr.RetrieveCommand(retrieveParams)
  );
  console.log("Received response", response);

  return;
};
