# AI Demo Cases

This repository intends to showcase & explore different AWS service & solution designs. Currently, there is a toolchain for text processing in place and a RAG use case has been started. To save cost, the resources have been shut down, except the S3 bucket for holding dummy data.

## Working with this repository

### Prerequisites

- An AWS account
- Ways to authenticate with the CLI with permanent access keys (discouraged) or temporary credentials, e.g. with [granted](https://www.granted.dev/) & SSO.
- Node & npm

### Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npx cdk deploy` deploy this stack to your default AWS account/region
- `npx cdk diff` compare deployed stack with current state
- `npx cdk synth` emits the synthesized CloudFormation template

### Deployment

This repository uses CDK as IaC tool. To deploy in your AWS account, make sure to be authenticated. Run `npx cdk deploy`, or `npx cdk watch` in case you want to retrieve logs to your CLI. This will set up all resources and provide ARNs and names of relevant resources on the command line.

It will create resources with unique names to avoid collisions. The names are cryptic, hence the use of CloudFormation outputs is recommended for exploring.

The stack is set up to delete itself after a defined period. This intends to save money, since OpenSearch Serverless is a very expensive service.

### Exploring

#### Text Processing

The architecture is visualized in the diagram below. It's central connection point is the S3 bucket. Its name is given as an output of the deployment.
to initiate the processing chain, you can upload an audio file to `<bucket name>/audio/` with the command `aws s3 cp ./<file name> s3://<bucket name>/audio/` (the bucket name is given as output on the command line). For now, it is only capable of transcribing `en-US` audio. Wait a couple of seconds and explore the content of the S3 bucket. If everything is successful, there should be four directories filled with the related content. Enjoy exploring! <3

```
- <bucket name>
    | - audio/
    | - speech/
    | - transcriptions/
    | - translations/
```

Happy

![architecture](./docs/architecture-diagram.drawio.svg)

#### RAG

The RAG application is provisioned, including an S3 bucket as data source for the data ingestion, an OpenSearch Serverless Cluster & a knowledge base. For evaluation purposes, a lambda function is provisioned to retrieve & generate content with help of the knowledge base.
