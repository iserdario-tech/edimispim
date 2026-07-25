import { describe, it, expect } from "vitest";
import { urlBase64ToUint8Array } from "../src/ui/notifications.js";

describe("notifications", () => {
  it("decodes a VAPID public key to a 65-byte P-256 key", () => {
    const key = "BPfPCikNLwAyTfK_9aNHSmPU-KAWyTe2rZF_WV29CEJzZU9oyJztXF_WQEtJLt6b7aea9ElXhF8868FI9Wd7T0M";
    expect(urlBase64ToUint8Array(key)).toHaveLength(65);
  });
});
