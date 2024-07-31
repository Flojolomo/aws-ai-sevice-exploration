import { Client } from "@opensearch-project/opensearch";

const client = new Client({ node: process.env.OPENSEARCH_DOMAIN });
export const handler = async () => {
  console.log(process.env.OPENSEARCH_DOMAIN);
  await client.indices.create({
    index: "your-index-name",
    body: {
      mappings: {
        properties: {
          field1: { type: "text" },
          field2: { type: "keyword" },
        },
      },
    },
  });
};
