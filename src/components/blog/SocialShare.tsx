"use client";

import { Icon } from "@iconify/react";

interface SocialShareProps {
  text: string;
  url: string | URL;
  className?: string;
}

export default function SocialShare({ text, url, className = "inline-block" }: SocialShareProps) {
  const shareUrl = typeof url === "string" ? url : url.toString();

  const handleShare = (platform: string) => {
    let shareLink = "";

    switch (platform) {
      case "twitter":
        shareLink = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
        break;
      case "facebook":
        shareLink = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        break;
      case "linkedin":
        shareLink = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
        break;
      case "whatsapp":
        shareLink = `https://wa.me/?text=${encodeURIComponent(`${text} ${shareUrl}`)}`;
        break;
      case "mail":
        shareLink = `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(shareUrl)}`;
        break;
      default:
        return;
    }

    if (platform === "mail") {
      window.location.href = shareLink;
    } else {
      window.open(shareLink, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className={`flex items-center ${className}`}>
      <span className="font-bold text-slate-500 dark:text-slate-400 mr-2">Share:</span>
      <button
        type="button"
        className="rtl:ml-0 rtl:mr-2"
        title="Twitter Share"
        onClick={() => handleShare("twitter")}
      >
        <Icon
          icon="tabler:brand-x"
          className="w-6 h-6 text-gray-400 dark:text-slate-500 hover:text-black dark:hover:text-slate-300"
        />
      </button>
      <button
        type="button"
        className="ml-2 rtl:ml-0 rtl:mr-2"
        title="Facebook Share"
        onClick={() => handleShare("facebook")}
      >
        <Icon
          icon="tabler:brand-facebook"
          className="w-6 h-6 text-gray-400 dark:text-slate-500 hover:text-black dark:hover:text-slate-300"
        />
      </button>
      <button
        type="button"
        className="ml-2 rtl:ml-0 rtl:mr-2"
        title="Linkedin Share"
        onClick={() => handleShare("linkedin")}
      >
        <Icon
          icon="tabler:brand-linkedin"
          className="w-6 h-6 text-gray-400 dark:text-slate-500 hover:text-black dark:hover:text-slate-300"
        />
      </button>
      <button
        type="button"
        className="ml-2 rtl:ml-0 rtl:mr-2"
        title="Whatsapp Share"
        onClick={() => handleShare("whatsapp")}
      >
        <Icon
          icon="tabler:brand-whatsapp"
          className="w-6 h-6 text-gray-400 dark:text-slate-500 hover:text-black dark:hover:text-slate-300"
        />
      </button>
      <button
        type="button"
        className="ml-2 rtl:ml-0 rtl:mr-2"
        title="Email Share"
        onClick={() => handleShare("mail")}
      >
        <Icon
          icon="tabler:mail"
          className="w-6 h-6 text-gray-400 dark:text-slate-500 hover:text-black dark:hover:text-slate-300"
        />
      </button>
    </div>
  );
}
