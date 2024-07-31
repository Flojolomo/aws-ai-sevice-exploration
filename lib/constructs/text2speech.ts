import * as sns from "aws-cdk-lib/aws-sns";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";

import { Construct } from "constructs";
import { LambdaFunction } from "./lambda-function";
import path = require("path");

interface Text2SpeechProps {
  bucket: s3.Bucket;
  inputFilePrefix: string;
  outputPrefix: string;
  languageMap: Record<string, string>;
  voiceMap: Record<string, string>;
}

export class Text2Speech extends Construct {
  public constructor(scope: Construct, id: string, props: Text2SpeechProps) {
    super(scope, id);

    const synthesizeCompleteTopic = this.createSynthesizeCompleteTopic();
    const { function: startSynthesizesJobFunction } =
      this.createSynthesizeJobStarterFunction({
        bucket: props.bucket,
        inputFilePrefix: props.inputFilePrefix,
        languageMap: props.languageMap,
        outputPrefix: props.outputPrefix,
        synthesizeCompleteTopic: synthesizeCompleteTopic,
        voiceMap: props.voiceMap,
      });

    this.createAudioFileCreatedFunction({ topic: synthesizeCompleteTopic });

    Text2Speech.allowStartingSpeechSynthesisJob(startSynthesizesJobFunction);
    synthesizeCompleteTopic.grantPublish(startSynthesizesJobFunction);
    props.bucket.grantReadWrite(startSynthesizesJobFunction);
  }

  private static allowStartingSpeechSynthesisJob(
    lambdaFunction: lambda.IFunction
  ) {
    lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["polly:StartSpeechSynthesisTask"],
        resources: ["*"],
      })
    );
  }

  private createSynthesizeCompleteTopic() {
    return new sns.Topic(this, "synthesize-complete");
  }

  private createSynthesizeJobStarterFunction({
    bucket,
    inputFilePrefix,
    languageMap,
    outputPrefix,
    synthesizeCompleteTopic,
    voiceMap,
  }: {
    bucket: s3.Bucket;
    inputFilePrefix: string;
    languageMap: Record<string, string>;
    outputPrefix: string;
    synthesizeCompleteTopic: sns.Topic;
    voiceMap: Record<string, string>;
  }) {
    return new LambdaFunction(this, "job-starter", {
      bucket: bucket,
      filters: [{ prefix: `${inputFilePrefix}` }],
      functionProps: {
        entry: path.join(__dirname, "..", "lambda/text2speech/preprocessor.ts"),
        environment: {
          SPEECH_OUTPUT_PREFIX: outputPrefix,
          SPEECH_SYNTHESIS_COMPLETE_TOPIC_ARN: synthesizeCompleteTopic.topicArn,
          LOCALE_MAP: JSON.stringify(languageMap),
          VOICE_MAP: JSON.stringify(voiceMap),
        },
      },
    });
  }

  private createAudioFileCreatedFunction({ topic }: { topic: sns.Topic }) {
    new LambdaFunction(this, "synthesis-complete", {
      topic: topic,
      functionProps: {
        entry: path.join(
          __dirname,
          "..",
          "lambda/text2speech/postprocessor.ts"
        ),
      },
    });
  }
}
