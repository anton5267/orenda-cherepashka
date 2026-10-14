export function getTelegramPromotionExpiry(title: string, publishedAt?: string) {
  const range = title.match(
    /(?:^|[^\d])(\d{1,2})[./-](\d{1,2})\s*(?:-|–|—|до)\s*(\d{1,2})[./-](\d{1,2})(?=$|[^\d])/i
  );
  const publishedDate = publishedAt ? new Date(publishedAt) : null;
  if (!range || !publishedDate || !Number.isFinite(publishedDate.getTime())) return null;

  const startDay = Number(range[1]);
  const startMonth = Number(range[2]);
  const endDay = Number(range[3]);
  const endMonth = Number(range[4]);
  const publishedYear = publishedDate.getUTCFullYear();
  const publishedMonth = publishedDate.getUTCMonth() + 1;
  const monthDifference = startMonth - publishedMonth;
  const startYear = monthDifference < -6
    ? publishedYear + 1
    : monthDifference > 6
      ? publishedYear - 1
      : publishedYear;
  const endYear = endMonth < startMonth ? startYear + 1 : startYear;
  const startTimestamp = Date.UTC(startYear, startMonth - 1, startDay);
  const endTimestamp = Date.UTC(endYear, endMonth - 1, endDay);
  const start = new Date(startTimestamp);
  const end = new Date(endTimestamp);

  if (
    start.getUTCFullYear() !== startYear ||
    start.getUTCMonth() !== startMonth - 1 ||
    start.getUTCDate() !== startDay ||
    end.getUTCFullYear() !== endYear ||
    end.getUTCMonth() !== endMonth - 1 ||
    end.getUTCDate() !== endDay
  ) {
    return null;
  }

  return end;
}
