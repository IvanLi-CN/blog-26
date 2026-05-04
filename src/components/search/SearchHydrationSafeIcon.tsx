"use client";

import { useEffect, useState } from "react";
import Icon from "../ui/Icon";

type SearchHydrationSafeIconProps = {
  name: string;
  className?: string;
};

export default function SearchHydrationSafeIcon({
  name,
  className = "",
}: SearchHydrationSafeIconProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return <span aria-hidden="true" className={className} />;

  return <Icon name={name} className={className} />;
}
