import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { LambdaFunction } from "./lambda-function";
import * as s3 from "aws-cdk-lib/aws-s3";
import path = require("path");
import { IFunction } from "aws-cdk-lib/aws-lambda";

interface TranscriptionProps {
  bucket: s3.Bucket;
  inputFilePrefix: string;
  outputPrefix: string;
}

export class Transcription extends Construct {
  public constructor(scope: Construct, id: string, props: TranscriptionProps) {
    super(scope, id);

    const { function: jobStarterFunction } = this.createJobStarterFunction({
      bucket: props.bucket,
      s3EventPrefix: props.inputFilePrefix,
      outputPrefix: props.outputPrefix,
    });

    Transcription.allowStartingTranscriptionJob(jobStarterFunction);

    const { function: outputTransformerFunction } =
      this.createOutputTransformerFunction({
        bucket: props.bucket,
        transformedFilePrefix: props.outputPrefix,
      });

    props.bucket.grantReadWrite(jobStarterFunction);
    props.bucket.grantReadWrite(outputTransformerFunction);
  }

  private static allowStartingTranscriptionJob(lambdaFunction: IFunction) {
    lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["transcribe:StartTranscriptionJob"],
        resources: ["*"],
      })
    );
  }

  private createJobStarterFunction({
    bucket,
    outputPrefix,
    s3EventPrefix,
  }: {
    bucket: s3.Bucket;
    outputPrefix: string;
    s3EventPrefix: string;
  }) {
    return new LambdaFunction(this, "started", {
      bucket: bucket,
      filters: [{ prefix: `${s3EventPrefix}` }],
      functionProps: {
        entry: path.join(
          __dirname,
          "..",
          "lambda/transcription/pre-process-handler.ts"
        ),
        environment: {
          TRANSCRIPTION_OUTPUT_BUCKET: bucket.bucketName,
          TRANSCRIPTION_OUTPUT_PREFIX: outputPrefix,
        },
      },
    });
  }

  private createOutputTransformerFunction({
    bucket,
    transformedFilePrefix,
  }: {
    bucket: s3.Bucket;
    transformedFilePrefix: string;
  }) {
    return new LambdaFunction(this, "output-transformer", {
      bucket: bucket,
      filters: [{ prefix: transformedFilePrefix, suffix: ".json" }],
      functionProps: {
        entry: path.join(
          __dirname,
          "..",
          "lambda/transcription/post-process-handler.ts"
        ),
        environment: {
          TRANSCRIPTION_TEXT_OUTPUT_BUCKET: bucket.bucketName,
          TRANSCRIPTION_TEXT_OUTPUT_PREFIX: transformedFilePrefix,
        },
      },
    });
  }
}
