import styles from "../../../../moduleCss/profile.module.css";
import { Skeleton } from "@/components/ui/skeleton";
import ProfileLayout from "@/components/profile/ProfileLayout";

/* ---------------- PROFILE IMAGE ---------------- */
// Mirror the real ProfileImageCard DOM: a centered vertical column of
// circular avatar → "Upload new photo" pill button → helper caption.
// Reuse the same CSS module classes so the skeleton inherits the column
// layout, gap, and responsive avatar sizing (130px → 80px on mobile).
export function ProfileImageCardSkeleton() {
  return (
    <div className={styles.profileImageCard}>
      <div className={styles.imageseditedsection}>
        {/* Circular avatar */}
        <Skeleton className={`${styles.imageCard} rounded-full`} />

        {/* Upload button + helper caption, stacked and centered */}
        <div className="flex flex-col items-center gap-[6px]">
          <Skeleton className="h-[42px] w-[200px] rounded-full" />
          <Skeleton className="h-[14px] w-[240px] rounded" />
        </div>
      </div>
    </div>
  );
}

/* ---------------- PROFILE INFO ---------------- */
export function ProfileInfoCardSkeleton() {
  return (
    <div className={styles.card_wrapper}>
      <div className="card_custom card_dark-bg">
        <div className={styles.profileInfo}>
          <div>
            <div className={styles.nameWrapper}>
              <Skeleton className="h-6 w-48" />
            </div>

            <div className={styles.profile_info_area}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={`${styles.profile_info} ${styles.location_wrapper}`}
                >
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- EDUCATION ---------------- */
export function EducationCardSkeleton() {
  return (
    <div className="card_custom card_dark-bg p-4 space-y-4 h-full">
      <Skeleton className="h-6 w-32" />

      <div className="flex gap-4 items-center">
        <Skeleton className="w-[100px] h-[100px] rounded-lg" />

        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    </div>
  );
}

/* ---------------- SKILLS ---------------- */
export function SkillsCardSkeleton() {
  return (
    <div className="card_custom card_dark-bg p-4 space-y-4 h-full">
      <Skeleton className="h-6 w-24" />

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
    </div>
  );
}

/* ---------------- ABOUT ---------------- */
export function AboutCardSkeleton() {
  return (
    <div className="card_custom card_dark-bg p-4 space-y-3">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-[90%]" />
      <Skeleton className="h-4 w-[80%]" />
    </div>
  );
}

/* ---------------- SUMMARY ---------------- */
export function SummaryCardSkeleton() {
  return (
    <div className="card_custom p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-28 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-[92%]" />
      <Skeleton className="h-4 w-[85%]" />
      <Skeleton className="h-4 w-[70%]" />
    </div>
  );
}

/* ---------------- FULL LAYOUT ---------------- */
// Use ProfileLayout itself so the skeleton lays out identically to the loaded
// page (header, 70/30 two-row grid, and the down area). Previously the skeleton
// rendered its own different grid, which made the loading state look unrelated
// to the actual layout.
export default function ProfileSkeleton() {
  return (
    <ProfileLayout
      topLeft={<ProfileImageCardSkeleton />}
      topRight={<EducationCardSkeleton />}
      bottomLeft={<ProfileInfoCardSkeleton />}
      bottomRight={<SkillsCardSkeleton />}
      down={
        <div className="space-y-4 mt-4">
          <AboutCardSkeleton />
          <SummaryCardSkeleton />
        </div>
      }
    />
  );
}
