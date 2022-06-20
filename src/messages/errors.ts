export interface ILeapError {
  description: string;
  reconnect?: boolean;
}

export enum LeapError {
  UNKNOWN = 4000,
  INVALID_AUTH,
  IDENTIFY_TIMEOUT,
  NOT_AUTHENTICATED,
  UNKNOWN_OPCODE,
  INVALID_PAYLOAD,
  BAD_ROUTE,
  OUT_OF_SYNC,
}

export const unknownError: ILeapError = {
  description: "Unknown error",
  reconnect: true,
};

export const errorMap: Partial<Record<LeapError, ILeapError>> = {
  [LeapError.INVALID_AUTH]: {
    description: "Invalid auth",
    reconnect: false,
  },
  [LeapError.IDENTIFY_TIMEOUT]: {
    description: "Identify timeout",
    reconnect: true,
  },
  [LeapError.NOT_AUTHENTICATED]: {
    description: "Not authenticated",
    reconnect: true,
  },
  [LeapError.UNKNOWN_OPCODE]: {
    description: "Invalid opcode",
    reconnect: true,
  },
  [LeapError.INVALID_PAYLOAD]: {
    description: "Invalid payload (doesn't match expected data field)",
    reconnect: true,
  },
  [LeapError.BAD_ROUTE]: {
    description: "Bad route",
    reconnect: true,
  },
};
