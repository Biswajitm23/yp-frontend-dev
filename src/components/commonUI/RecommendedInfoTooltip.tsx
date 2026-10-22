"use client";

import { Info } from "lucide-react";
import Tooltip from "@/components/commonUI/ToolTip";

/**
 * The ⓘ that explains what "Recommended" means, matching the mobile app's copy.
 * Shared by the Jobs sidebar widget and the Recommended tab on the job listing
 * so the wording can't drift between them.
 */
export default function RecommendedInfoTooltip({
  position = "top-right",
  size = 14,
}: {
  position?: "top" | "bottom" | "left" | "right" | "top-right";
  size?: number;
}) {
  return (
    <Tooltip
      position={position}
      // Portalled: this ⓘ lives in the Jobs sidebar, which scrolls
      // (`.sidebar_main_section` is overflow auto/hidden) and therefore cropped
      // the panel's top edge. A portal also sidesteps the global
      // `.login-tooltip` geometry — a 340px panel offset half its width to the
      // left, far too wide for the ~342px sidebar column.
      portal
      portalMaxWidth={260}
      content={
        <div>
          <p className="font-semibold mb-1">Recommended for you</p>
          <p>
            Recommended based on your interests, skills and education profile.
          </p>
        </div>
      }
    >
      <button
        type="button"
        tabIndex={0}
        aria-label="What does Recommended mean?"
        // The parent header/tab is itself clickable — keep the ⓘ from
        // collapsing the section or switching tabs.
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="flex items-center text-gray-400 hover:text-white shrink-0 info-button cursor-pointer"
      >
        <Info size={size} />
      </button>
    </Tooltip>
  );
}
