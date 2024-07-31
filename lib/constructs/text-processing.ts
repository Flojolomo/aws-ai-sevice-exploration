import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { VoiceId } from "@aws-sdk/client-polly";
import { Transcription } from "./transcription";
import * as sns from "aws-cdk-lib/aws-sns";
import { Translate } from "./translate";
import { Text2Speech } from "./text2speech";

export class TextProcessing extends Construct {
  private static readonly audioPrefix = "audio/";
  private static readonly transcriptionsOutputPrefix = "transcriptions/";
  //   private static readonly translationsInputPrefix = "translations/inputs/";
  private static readonly translationsOutputPrefix = "translations/outputs/";
  private static readonly speechOutputPrefix = "speech/";
  private static readonly targetLocales = ["de-DE", "es-ES", "fr-FR"];
  private static readonly targetLanguageKeys = TextProcessing.targetLocales.map(
    (locale) => locale.split("-")[0]
  );

  private static readonly languageMap = TextProcessing.targetLocales.reduce(
    (acc: Record<string, string>, locale) => {
      acc[locale.split("-")[0]] = locale;
      return acc;
    },
    {}
  );

  private static readonly voiceMap = {
    "en-EN": VoiceId.Joanna,
    "es-ES": VoiceId.Lucia,
    "fr-FR": VoiceId.Celine,
    "de-DE": VoiceId.Vicki,
  };
  public constructor(scope: Construct, id: string) {
    super(scope, id);

    const artifactStore = this.artifactStore();

    new Transcription(this, "transcription", {
      bucket: artifactStore,
      inputFilePrefix: TextProcessing.audioPrefix,
      outputPrefix: TextProcessing.transcriptionsOutputPrefix,
    });

    new Translate(this, "translate", {
      bucket: artifactStore,
      inputFilePrefix: TextProcessing.transcriptionsOutputPrefix,
      languageKeys: TextProcessing.targetLanguageKeys,
      outputPrefix: TextProcessing.translationsOutputPrefix,
    });

    new Text2Speech(this, "text2speech", {
      bucket: artifactStore,
      inputFilePrefix: TextProcessing.translationsOutputPrefix,
      outputPrefix: TextProcessing.speechOutputPrefix,
      languageMap: TextProcessing.languageMap,
      voiceMap: TextProcessing.voiceMap,
    });
  }

  private artifactStore() {
    const bucket = new s3.Bucket(this, "artifact-store", {
      lifecycleRules: [
        {
          id: "expire-after-7-days",
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
          expiration: cdk.Duration.days(7),
        },
      ],
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cdk.CfnOutput(this, "artifact-store-name", {
      value: bucket.bucketName,
    });

    return bucket;
  }
}
