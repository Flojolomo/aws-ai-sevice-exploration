import {
  StartTextTranslationJobCommandInput,
  Translate,
  TranslateTextCommandInput,
} from "@aws-sdk/client-translate";
import * as path from "path";

const translateClient = new Translate();

export async function createTranslateBatchJob({
  bucketName,
  sourcePrefix,
  targetPrefix,
}: {
  bucketName: string;
  sourcePrefix: string;
  targetPrefix: string;
}) {
  const translationJobParams: StartTextTranslationJobCommandInput = {
    JobName: `${Date.now()}-${path.basename(sourcePrefix)}`,
    DataAccessRoleArn:
      "arn:aws:iam::891376965822:role/AiDemoCasesStack-translationrole543F2247-fPt4OORfdjDV",
    InputDataConfig: {
      S3Uri: `s3://${bucketName}/${sourcePrefix}`,
      ContentType: "text/plain",
    },
    OutputDataConfig: {
      S3Uri: `s3://${bucketName}/${targetPrefix}`,
    },
    SourceLanguageCode: "en",
    TargetLanguageCodes: JSON.parse(process.env.TARGET_LANGUAGES!),
  };

  console.info("Starting translation job", { translationJobParams });
  const startJobResult = await translateClient.startTextTranslationJob(
    translationJobParams
  );
  console.info("Translation job started", { startJobResult });
  return startJobResult.JobId;
}

export async function translateText(text: string, language: string) {
  const translationParams: TranslateTextCommandInput = {
    SourceLanguageCode: "en",
    TargetLanguageCode: language,
    Text: text!,
  };

  console.info("Translating text", { translationParams });
  const translationResult = await translateClient.translateText(
    translationParams
  );
  console.debug("Translation result", { translationResult });

  return translationResult.TranslatedText;
}
