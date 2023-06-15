import dotenv from "dotenv";

dotenv.config();

const castEnv = <T = string>({
  env,
  name,
}: {
  env: T | undefined;
  name: string;
}): T => {
  if (!env) throw new Error(`\n ENV for ${name} not provided`);
  return env;
};

export const env = {
  imageId: process.env.IMAGE_ID,
  imageType: process.env.IMAGE_TYPE,
  region: process.env.REGION,
  securityId: castEnv({ env: process.env.SG_ID, name: "SG_ID" }),
  securityGroup: castEnv({ env: process.env.SG, name: "SG" }),
  keyName: process.env.KEY_NAME,
  pat: process.env.PAT,
  isDev: process.env?.NODE_ENV === "develop",
  git: {
    remote_url: process.env.REMOTE_REPO,
  },
  sshKeys: {
    publicKey: castEnv({
      env: process.env.SSH_PUBLIC_KEY,
      name: "SSH_PUBLIC_KEY",
    }),
    privateKey: castEnv({
      env: process.env.SSH_PRIVATE_KEY,
      name: "SSH_PRIVATE_KEY",
    }),
  },
};
