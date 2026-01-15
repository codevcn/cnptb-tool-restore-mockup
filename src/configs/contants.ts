export const endpoints = {
  serverEndpoint: process.env.SERVER_ENDPOINT,
  publicAssetsEndpoint: process.env.PUBLIC_ASSETS_ENDPOINT,
}

export const elementDefaultStyles = {
  text: {
    elementHeight: 33,
    fontSize: 33,
  },
}

export enum EClientRequestHeaders {
  APP_MOCKUP_ID = "my-app-mockup-id",
  FROM_LOCATION = "my-app-from-location",
}

export enum ERequestPayloadFields {
  LOCAL_BLOBS = "local_blobs",
  MAIN_DATA = "main_data",
  USER_AGENT_DATA = "ua_data",
}
