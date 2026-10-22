/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Image from "next/image";
import Avatar from "../commonUI/Avatar";
import styles from "@/moduleCss/feeds.module.css";
import { isAdminReply } from "@/helpers/groupComments";

// Fallback avatar for admin replies whose author has no profile image (the
// backend returns profile_image_url: null for the YP admin account).
// The file lives at public/images/y-pro.png.
const ADMIN_AVATAR_FALLBACK = "/images/y-pro.png";

type Props = {
  reply: any;
  isLight: boolean;
  getCompactTimeAgo: (date: string) => string;
  onImageClick: (url: string) => void;
  /** Id of the comment/reply to highlight (notification deep-link). */
  highlightedCommentId?: string | null;
};

/**
 * A single admin-reply card (DISPLAY-ONLY). Reuses the normal comment card
 * styles — same bubble, fonts, 32px avatar, time — with: a grey transparent
 * name chip, the YP logo avatar fallback, no verified tick, no three-dot menu,
 * and no profile navigation. Shared by the feed and the gallery modal.
 */
export default function CommentReplyCard({
  reply,
  isLight,
  getCompactTimeAgo,
  onImageClick,
  highlightedCommentId = null,
}: Props) {
  const replyKey = String(reply?.id || reply?._id || "");
  return (
    <div
      id={`comment-${reply.id || reply._id}`}
      className={`${
        styles.feed_post_item_body_bottom_area_right_comment_list_comment_area_bottom_items_item
      } ${
        highlightedCommentId === replyKey ? styles.comment_highlight : ""
      }`}
    >
      <div className={styles.feed_post_comment_area_header_area}>
        <Avatar
          imageUrl={
            reply.author?.profile_image_url ||
            (isAdminReply(reply) ? ADMIN_AVATAR_FALLBACK : null)
          }
          firstName={reply.author?.first_name?.split(" ")[0]}
          lastName={
            reply.author?.last_name ||
            reply.author?.first_name?.split(" ").slice(1).join(" ")
          }
          size={32}
          className="comment-avatar-image shrink-0"
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.comment_admin_name_row}>
            <div
              className={`${
                styles.feed_post_item_body_bottom_area_right_comment_list_comment_area_bottom_items_item_profile_name_first_name
              } ${isAdminReply(reply) ? styles.comment_admin_name_chip : ""}`}
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
                ...(isLight ? { color: "#3960FB" } : {}),
              }}
            >
              {reply.author?.first_name} {reply.author?.last_name}
            </div>
          </div>
        </div>
        <div
          className={
            styles.feed_post_item_body_bottom_area_right_comment_list_comment_area_bottom_items_item_time_container
          }
        >
          <span
            className={
              styles.feed_post_item_body_bottom_area_right_comment_list_comment_area_bottom_items_item_time
            }
            style={{ ...(isLight ? { color: "#888888" } : {}) }}
          >
            {getCompactTimeAgo(reply.created_at || "")}
          </span>
          {/* No three-dot menu on admin replies */}
        </div>
      </div>
      <div className={styles.feed_post_comment_area_body_area}>
        {reply?.comment_media_urls ? (
          <>
            {Array.isArray(reply.comment_media_urls) ? (
              reply.comment_media_urls.map((url: string, mIdx: number) => (
                <div
                  key={mIdx}
                  style={{
                    marginTop: "8px",
                    marginBottom: "8px",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <Image
                    src={url}
                    alt={`Reply Media ${mIdx + 1}`}
                    width={200}
                    height={200}
                    className={
                      styles.feed_post_item_body_bottom_area_right_comment_list_comment_area_bottom_items_item_comment_media
                    }
                    style={{
                      maxWidth: "200px",
                      maxHeight: "200px",
                      objectFit: "cover",
                      cursor: "pointer",
                      borderRadius: "4px",
                      marginBottom: "10px",
                    }}
                    onClick={() => onImageClick(url)}
                  />
                </div>
              ))
            ) : (
              <div
                style={{
                  marginTop: "8px",
                  marginBottom: "8px",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <Image
                  src={reply.comment_media_urls as string}
                  alt="Reply Media"
                  width={200}
                  height={200}
                  className={
                    styles.feed_post_item_body_bottom_area_right_comment_list_comment_area_bottom_items_item_comment_media
                  }
                  style={{
                    maxWidth: "160px",
                    maxHeight: "160px",
                    objectFit: "cover",
                    cursor: "pointer",
                    borderRadius: "4px",
                  }}
                  onClick={() => onImageClick(reply.comment_media_urls as string)}
                />
              </div>
            )}
          </>
        ) : null}
        <div style={{ marginTop: "10px" }} className={styles.feed_comment}>
          {reply.comment_text}
        </div>
      </div>
    </div>
  );
}
