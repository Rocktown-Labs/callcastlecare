const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
];

export const getMediaUploadUrl = (baseOrigin: string) =>
  `${baseOrigin}/api/v1/media/client-upload`;

export const createMediaStoragePath = (input: {
  extension: string;
  mediaType: string;
  orderId?: number;
  legId?: number;
}) => {
  const orderSegment = input.orderId ? `order-${input.orderId}` : "order-none";
  const legSegment = input.legId ? `leg-${input.legId}` : "leg-none";
  const timestamp = Date.now();
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  return `callcastlecare-media/${orderSegment}/${legSegment}/${input.mediaType}/${timestamp}-${random}.${input.extension}`;
};

export const mediaValidation = {
  allowedContentTypes: ALLOWED_CONTENT_TYPES,
  maxUploadSizeBytes: MAX_UPLOAD_SIZE_BYTES,
  pathnamePrefix: "callcastlecare-media/",
};
