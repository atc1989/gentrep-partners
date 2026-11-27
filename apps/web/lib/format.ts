const TZ = "Asia/Manila"; // company time, UTC+8

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
export const formatDay = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
export const count = (n: number) => n.toLocaleString("en-PH");
