/** Sub-process `details` keys set by the API from SLN and process hierarchy. */
export const SERVER_GENERATED_ACTIVITY_DETAIL_KEYS = ['si_no', 'activity_id'] as const;

export function isServerGeneratedActivityDetailKey(key: string): boolean {
  return (SERVER_GENERATED_ACTIVITY_DETAIL_KEYS as readonly string[]).includes(key);
}
