import React from "react";

/**
 * The header's "Jobs" nav glyph (Ionicons briefcase), inlined as a component so
 * it can take a colour — same approach as {@link CompanyBuildingIcon}.
 *
 * The shipped assets bake their colour in: ion_briefcase.svg / -outline.svg are
 * `white` and briefcase_filled_light.svg / _outline_light.svg are `#356FEE`,
 * which is why the header has to keep four separate files and swap between them.
 * Inlined with `currentColor`, one component covers active/inactive in both
 * themes by inheriting whatever colour the caller is already using.
 *
 * Geometry is copied verbatim from those assets (130x130 viewBox) so this
 * matches the top nav and the mobile app exactly.
 */
export default function BriefcaseIcon({
  filled = false,
  className,
  ...props
}: React.SVGProps<SVGSVGElement> & { filled?: boolean }) {
  const shared = {
    viewBox: "0 0 130 130",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
    focusable: "false" as const,
    className,
    ...props,
  };

  if (filled) {
    return (
      <svg {...shared} fill="currentColor">
        <path d="M125.938 44.6875C125.933 40.3792 124.219 36.2487 121.173 33.2022C118.126 30.1558 113.996 28.4422 109.688 28.4375H97.5V24.375C97.4966 21.1437 96.2115 18.0457 93.9267 15.7608C91.6418 13.476 88.5438 12.1909 85.3125 12.1875H44.6875C41.4562 12.1909 38.3582 13.476 36.0733 15.7608C33.7885 18.0457 32.5034 21.1437 32.5 24.375V28.4375H20.3125C16.0042 28.4422 11.8737 30.1558 8.82721 33.2022C5.78076 36.2487 4.0672 40.3792 4.0625 44.6875V56.875H125.938V44.6875ZM89.375 28.4375H40.625V24.375C40.625 23.2976 41.053 22.2642 41.8149 21.5024C42.5767 20.7405 43.6101 20.3125 44.6875 20.3125H85.3125C86.3899 20.3125 87.4233 20.7405 88.1851 21.5024C88.947 22.2642 89.375 23.2976 89.375 24.375V28.4375ZM85.3125 67.0312C85.3125 68.6474 84.6705 70.1974 83.5277 71.3402C82.3849 72.483 80.8349 73.125 79.2188 73.125H50.7812C49.1651 73.125 47.6151 72.483 46.4723 71.3402C45.3295 70.1974 44.6875 68.6474 44.6875 67.0312V66.0156C44.6875 65.7463 44.5805 65.4879 44.39 65.2975C44.1996 65.107 43.9412 65 43.6719 65H4.0625V101.562C4.0625 105.872 5.77455 110.006 8.82201 113.053C11.8695 116.1 16.0027 117.812 20.3125 117.812H109.688C113.997 117.812 118.131 116.1 121.178 113.053C124.225 110.006 125.938 105.872 125.938 101.562V65H86.3281C86.0588 65 85.8004 65.107 85.61 65.2975C85.4195 65.4879 85.3125 65.7463 85.3125 66.0156V67.0312Z" />
      </svg>
    );
  }

  return (
    <svg
      {...shared}
      fill="none"
      stroke="currentColor"
      /* Source art is 8.125 on a 130 viewBox (~1px at 16px), noticeably lighter
         than the lucide icons on the sibling tabs. 10.833 is lucide's 2/24
         weight at this viewBox, so the row reads as one set. */
      strokeWidth={10.833}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M109.688 32.5H20.3125C13.5815 32.5 8.125 37.9565 8.125 44.6875V101.562C8.125 108.293 13.5815 113.75 20.3125 113.75H109.688C116.418 113.75 121.875 108.293 121.875 101.562V44.6875C121.875 37.9565 116.418 32.5 109.688 32.5Z" />
      <path d="M36.5625 32.5V24.375C36.5625 22.2201 37.4185 20.1535 38.9423 18.6298C40.466 17.106 42.5326 16.25 44.6875 16.25H85.3125C87.4674 16.25 89.534 17.106 91.0577 18.6298C92.5815 20.1535 93.4375 22.2201 93.4375 24.375V32.5M121.875 60.9375H8.125M81.25 60.9375V67.0312C81.25 67.57 81.036 68.0866 80.6551 68.4676C80.2741 68.8485 79.7575 69.0625 79.2188 69.0625H50.7812C50.2425 69.0625 49.7259 68.8485 49.3449 68.4676C48.964 68.0866 48.75 67.57 48.75 67.0312V60.9375" />
    </svg>
  );
}
