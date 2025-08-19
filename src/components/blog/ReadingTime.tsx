import { Icon } from "@iconify/react";
import { calculateReadingTime, formatReadingTime } from "../../lib/reading-time";

interface ReadingTimeProps {
  content: string;
  className?: string;
}

export default function ReadingTime({ content, className = "" }: ReadingTimeProps) {
  const readingTimeMinutes = calculateReadingTime(content);
  const formattedTime = formatReadingTime(readingTimeMinutes);

  return (
    <span
      className={`inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 ${className}`}
    >
      <Icon icon="tabler:clock" className="w-4 h-4" />
      <time>{formattedTime}</time>
    </span>
  );
}
