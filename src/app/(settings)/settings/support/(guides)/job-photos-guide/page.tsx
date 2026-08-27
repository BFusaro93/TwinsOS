import {
  DocsFontScope,
  DocsHero,
  Section,
  Callout,
  Table,
  TableHeadRow,
  TOCLink,
} from "@/components/docs/DocsBrand";

const ROLE_PERMISSIONS: [string, string, string, string, string][] = [
  ["Admin",              "Yes", "Yes", "Yes", "Yes"],
  ["Manager (“Sales”)", "Yes", "Yes", "Yes", "Yes"],
  ["Crew",               "Yes — auto-granted", "Yes", "No", "No"],
  ["Technician",         "Only with the access flag", "Yes", "No", "No"],
  ["Viewer / Purchaser",  "Only with the access flag", "No", "No", "No"],
];

const TAGS = ["Tree Removal", "Trimming", "Mulch", "Lawn", "Drainage", "Hardscape", "Cleanup", "Other"];

const DRAW_TOOLS: [string, string][] = [
  ["Select", "Click an existing shape or text label to select, move, resize, or rotate it. Delete key (or the toolbar trash icon) removes what's selected."],
  ["Arrow", "Click and drag to draw a straight arrow with a filled head — the standard “this, right here” marker."],
  ["Circle", "Click to drop a fixed 40px-radius outlined circle centered on the click point."],
  ["Text", "Click to place an editable label (“Label” by default) with a semi-transparent black background so it reads over any photo. Double-click to rename it."],
  ["Draw (freehand)", "Switches the canvas into freehand pencil mode — draw any freeform line, 4px wide."],
];

export default function JobPhotosGuidePage() {
  return (
    <DocsFontScope className="flex h-full flex-col gap-6 overflow-y-auto pb-12">
      <DocsHero
        kicker="Landscapt / CRM · Equipt"
        title="Job Photos"
        description="Field photo documentation, annotation, and before/after comparisons — attached to a job site, not a person."
      />

      <div className="rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
          On this page
        </h2>
        <div className="flex flex-col gap-1">
          <TOCLink href="#what-it-is">What it is, and where to find it</TOCLink>
          <TOCLink href="#access">Who can access it</TOCLink>
          <TOCLink href="#photo-jobs">Photo Jobs</TOCLink>
          <TOCLink href="#uploading">Uploading photos, videos, and files</TOCLink>
          <TOCLink href="#organizing">Tagging, before/after, and comparisons</TOCLink>
          <TOCLink href="#annotating">Annotating a photo</TOCLink>
          <TOCLink href="#worked-example">Worked example: documenting a mulch job</TOCLink>
          <TOCLink href="#limitations">Known limitations</TOCLink>
        </div>
      </div>

      <Section id="what-it-is" title="What it is, and where to find it">
        <p>
          <strong>Job Photos</strong> is a paid add-on (<code>job_photos</code> in the billing
          catalog — see <code>src/lib/stripe/addons.ts:3</code>) that gives crews and office staff a
          place to capture, tag, and mark up photos (and other files) tied to a job site. It&apos;s the
          same underlying feature everywhere it shows up — one component,{" "}
          <code>JobPhotosPage</code> (<code>src/components/photo-docs/JobPhotosPage.tsx</code>), is
          rendered at two different routes:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Its own app shell</strong> at <code>/photos/jobs</code>, with a dedicated
            dark sidebar (<code>src/components/photo-docs/PhotosSidebar.tsx:20-23</code>) — this is
            what crew accounts land on. The Home dashboard surfaces it as a &quot;Job Photos&quot;
            tile (&quot;Field photo documentation &amp; field forms&quot;) whenever the org has the
            add-on, both for crew accounts and everyone else
            (<code>src/app/(home)/home/page.tsx:61,92-100,114,119</code>).
          </li>
          <li>
            <strong>Inside Landscapt/CRM</strong>, under Scheduling → Job Photos
            (<code>src/components/crm/CRMSidebar.tsx:88</code>, route at{" "}
            <code>/crm/scheduling/job-photos</code>).
          </li>
        </ul>
        <p>
          A Photo Job can optionally link to an Equipt Project (for cost tracking) or a Landscapt
          Client — both links are visible and editable from the job detail pane. It is not tied to
          a specific CMMS Work Order, PM Schedule, or CRM Job/visit — see{" "}
          <a href="#limitations" className="text-[#60ab45] hover:underline">Known limitations</a>{" "}
          below for what that means in practice.
        </p>
      </Section>

      <Section id="access" title="Who can access it">
        <p>
          Access is role-based, computed client-side in{" "}
          <code>usePhotoAccess()</code> (<code>src/modules/photo-docs/hooks/usePhotoAccess.ts</code>).
          Admins and Crew accounts always have access; everyone else needs an explicit{" "}
          <code>photo_module_access</code> flag on their profile. This is <em>not</em> a crew-only
          tool — managers, admins, and technicians can all be granted access, and in practice the
          full gallery/detail view (edit, archive, delete, project/client linking) is only shown to
          non-crew roles, while crew gets a simplified mobile-first view.
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Can access</th>
              <th className="px-3 py-2">Can upload</th>
              <th className="px-3 py-2">Can annotate</th>
              <th className="px-3 py-2">Can delete</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {ROLE_PERMISSIONS.map(([role, access, upload, annotate, del]) => (
              <tr key={role} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{role}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{access}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{upload}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{annotate}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{del}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Callout>
          <strong>Crew sees a different screen, not a locked-down one.</strong> When the signed-in
          user is Crew, the job detail page renders <code>CrewPhotoView</code> instead of the full{" "}
          <code>PhotoGallery</code> (<code>src/app/(photos)/photos/jobs/[jobId]/page.tsx:296-300</code>):
          a two-column grid, Before/After/All filters, a big sticky &quot;Upload Progress Photo&quot;
          button, and a read-only lightbox. Crew cannot open the annotation editor — the route itself
          redirects them away if they land on it directly
          (<code>src/app/(photos)/photos/jobs/[jobId]/[photoId]/annotate/page.tsx:14-17</code>).
        </Callout>
      </Section>

      <Section id="photo-jobs" title="Photo Jobs">
        <p>
          Photos aren&apos;t uploaded loose — every photo belongs to a <strong>Photo Job</strong>, a
          lightweight record (name, customer name, address, notes, status) that exists specifically
          for organizing photo documentation by job site
          (<code>src/modules/photo-docs/types/photo.types.ts:23-40</code>). Photo Jobs are distinct
          from CMMS Work Orders and CRM Jobs — they&apos;re their own object.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Status</strong> — <code>active</code>, <code>complete</code>, or{" "}
            <code>pending</code>, changed with one-click action buttons on the detail pane.
          </li>
          <li>
            <strong>Archive</strong> — a separate axis from status; archived jobs drop out of the
            default list but can still be found under the &quot;Archived&quot; view filter.
          </li>
          <li>
            <strong>Optional Project link</strong> — ties the Photo Job to an Equipt/PO Project for
            cost tracking; the linked project&apos;s status badge and full detail sheet are reachable
            directly from the Photo Job.
          </li>
          <li>
            <strong>Optional Client link</strong> — ties the Photo Job to a Landscapt Client record.
            If left unlinked, the job is only associated with a customer by free-text name — see{" "}
            <a href="#limitations" className="text-[#60ab45] hover:underline">Known limitations</a>.
          </li>
        </ul>
        <p>
          Both List and Table view modes are available for browsing Photo Jobs
          (<code>src/components/photo-docs/JobPhotosPage.tsx:414-421</code>), and each job has its
          own Comments and Audit Trail tabs, same as other record types in the app.
        </p>
      </Section>

      <Section id="uploading" title="Uploading photos, videos, and files">
        <p>
          The uploader (<code>src/modules/photo-docs/components/PhotoUploader.tsx</code>) offers four
          entry points: <strong>Camera</strong> (opens the device&apos;s rear camera directly via{" "}
          <code>capture=&quot;environment&quot;</code> on mobile), <strong>Library</strong> (photo
          picker), <strong>Videos</strong>, and <strong>Files</strong> (PDF, Word, Excel, PowerPoint,
          text, CSV). Multiple files can be queued at once.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Image compression</strong> — any image over 500 KB is compressed client-side to
            a 500 KB target (max dimension 2048px, JPEG/PNG, quality 0.85) before upload, explicitly
            to keep uploads workable on poor cell coverage in the field
            (<code>src/modules/photo-docs/lib/imageCompression.ts:5-27</code>). EXIF is preserved
            through compression. If compression fails for any reason, the original file is uploaded
            unmodified rather than blocking the upload.
          </li>
          <li>
            <strong>Location tagging</strong> — GPS is captured from the device&apos;s live Geolocation
            API at the moment of upload, not parsed from the photo&apos;s EXIF data. The code is explicit
            about why: mobile browsers routinely strip EXIF GPS tags before JavaScript can read them,
            so &quot;where the device is right now&quot; is the more reliable signal for a photo being
            taken live in the field (<code>src/modules/photo-docs/lib/imageCompression.ts:39-46</code>).
            If location permission is denied, the photo still uploads — it&apos;s just untagged.
          </li>
          <li>
            <strong>iCloud proxy warning</strong> — the uploader flags any image under 100 KB with a
            visible warning that it may be an undownloaded iCloud thumbnail rather than the real
            photo, and suggests opening it in the Photos app first
            (<code>src/modules/photo-docs/components/PhotoUploader.tsx:230-235</code>).
          </li>
          <li>
            Each queued file can be given a display name, a Before/During/After/Neither flag, one or
            more tags, and a note before submitting — set individually per file or as a default
            applied to the whole batch.
          </li>
        </ul>
        <Callout>
          Storage: originals go to the <code>job-photos-original</code> Supabase bucket, annotated
          composites to <code>job-photos-annotated</code>
          (<code>src/modules/photo-docs/lib/photoStorage.ts:3-4</code>). Only the storage path is
          stored in the <code>job_photos</code> table — signed URLs (1-hour TTL) are generated fresh
          at read time, never persisted, matching how attachments work elsewhere in the app.
          Deleting a photo soft-deletes the database row only; the underlying storage object is left
          in place intentionally, with storage cleanup treated as a separate admin task
          (<code>src/modules/photo-docs/lib/photoStorage.ts:97-103</code>).
        </Callout>
      </Section>

      <Section id="organizing" title="Tagging, before/after, and comparisons">
        <p>
          Every photo (or video) can carry a Before/During/After/Neither flag and any number of the
          fixed tag set:
        </p>
        <p className="flex flex-wrap gap-1.5">
          {TAGS.map((t) => (
            <span key={t} className="rounded-full bg-[#f4f6f0] px-2.5 py-1 text-xs font-medium text-[#396927]">{t}</span>
          ))}
        </p>
        <p>
          The gallery (office/full view) can filter by file type (Photos / Videos / Docs) and by the
          Before/During/After/Annotated tabs. A &quot;Select&quot; mode lets you multi-select photos
          to bulk-apply a Before/After/During tag, or to clear tags.
        </p>
        <p>
          <strong>Before/After comparisons</strong> are a separate, explicit pairing — not just two
          photos that happen to share the Before/After tag. Select exactly two photos in Select mode
          and choose &quot;Pair as Before/After&quot;; a dialog lets you preview each photo, swap
          which one is &quot;before&quot; vs. &quot;after&quot;, and give the pair an optional label
          (e.g. &quot;Front bed&quot;, &quot;Retaining wall&quot;). A job can have several such pairs.
          Comparisons render with a slider view (<code>BeforeAfterSlider</code>), and any comparison
          can be deleted independently of the photos it references
          (<code>src/modules/photo-docs/components/PhotoGallery.tsx:106-127,257-323</code>).
        </p>
      </Section>

      <Section id="annotating" title="Annotating a photo">
        <p>
          The annotation editor (<code>src/modules/photo-docs/components/AnnotationEditor.tsx</code>)
          is a Fabric.js canvas layered over the original photo, reachable from any photo&apos;s{" "}
          &quot;Annotate&quot; button (Admin/Manager only). It exists to mark up areas of interest for
          the crew to see — the page&apos;s own subheading says exactly that: &quot;Mark up areas of
          interest for the crew&quot;
          (<code>src/app/(photos)/photos/jobs/[jobId]/[photoId]/annotate/page.tsx:31</code>).
        </p>
        <Table>
          <thead>
            <TableHeadRow>
              <th className="px-3 py-2">Tool</th>
              <th className="px-3 py-2">What it does</th>
            </TableHeadRow>
          </thead>
          <tbody>
            {DRAW_TOOLS.map(([tool, desc]) => (
              <tr key={tool} className="border-b border-[#eceae3] last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-[#0a0a0a]">{tool}</td>
                <td className="px-3 py-2 text-[#4a4a46]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Four colors are available — Red, Yellow, Green, White — applied to whichever tool is
          active. Undo removes the most recently added shape; Delete removes whatever is currently
          selected.
        </p>
        <p>
          Saving renders the canvas (photo + all markup) to a flattened PNG, uploads it to the{" "}
          <code>job-photos-annotated</code> bucket, and stores the raw Fabric.js JSON alongside it so
          the annotation can be reopened and edited later — not just viewed as a flat image
          (<code>src/modules/photo-docs/hooks/useAnnotations.ts</code>,{" "}
          <code>AnnotationEditor.tsx:273-306</code>). Once a photo has annotations, both the office
          gallery and the crew view display the annotated composite instead of the plain original by
          default, with a small pencil-icon badge marking which photos have markup.
        </p>
        <Callout>
          Re-opening a previously annotated photo on a different screen size re-scales every saved
          shape to match, rather than leaving them positioned for the original canvas dimensions —
          this is handled explicitly in the load path
          (<code>AnnotationEditor.tsx:186-218</code>) so an annotation made on a desktop still lines
          up correctly when reviewed on a crew tablet.
        </Callout>
      </Section>

      <Section id="worked-example" title="Worked example: documenting a mulch job">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Office creates a Photo Job — &quot;123 Main St — Lawn &amp; Mulch&quot; — optionally
            linking it to the Client and/or the Equipt Project for cost tracking.
          </li>
          <li>
            Before the crew starts, someone (crew or office) uploads a &quot;Before&quot; photo of
            the bed from the <strong>Camera</strong> picker. It&apos;s automatically compressed and GPS-
            tagged from the device&apos;s current location.
          </li>
          <li>
            A manager opens that Before photo and annotates it — a red circle around a low spot that
            needs extra mulch depth, plus a text label reading &quot;2″ here&quot; — and saves.
            The circle and label are now baked into a composite PNG the crew sees when they open the
            photo, without needing to be in the office to hear the instruction.
          </li>
          <li>
            After the crew finishes, they upload an &quot;After&quot; photo of the same bed from the
            field — a two-tap flow (Camera → Upload) that doesn&apos;t require touching a keyboard.
          </li>
          <li>
            Office selects both photos in Select mode, chooses &quot;Pair as Before/After&quot;,
            confirms which is which, labels the pair &quot;Front bed&quot;, and saves. The comparison
            now appears with a slider anyone reviewing the job can drag between before and after.
          </li>
        </ol>
      </Section>

      <Section id="limitations" title="Known limitations">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Client linking is manual and optional.</strong> A Photo Job stores a free-text{" "}
            <code>customerName</code> and an optional <code>clientId</code> FK
            (<code>photo.types.ts:37-38</code>). If no client is explicitly linked, the job is
            associated with a customer by name string only — there&apos;s no automatic matching against
            the Clients table. Per <code>CLAUDE.md</code>, this kind of auto-match/client-linking
            work for photo jobs and damage cases is intentionally deferred until after the
            Landscapt dev/prod split.
          </li>
          <li>
            <strong>No link to a specific CRM Job, visit, or CMMS Work Order.</strong> A Photo Job
            can only be linked to a Project (Equipt/PO) or a Client — not to an individual scheduled
            visit or work order. Photos document a job <em>site</em>, not a specific dispatch.
          </li>
          <li>
            <strong>Deleted storage objects are not cleaned up automatically.</strong> Soft-deleting
            a photo removes the database row but intentionally leaves the file sitting in Supabase
            Storage; a real cleanup pass is a separate, unbuilt admin task.
          </li>
          <li>
            <strong>The Draw and Circle annotation tools are fixed-size/simple.</strong> Circles are
            always a 40px radius regardless of drag distance, and there&apos;s no rectangle, highlighter,
            or measurement tool — only Arrow, Circle, Text, and freehand Draw.
          </li>
        </ul>
      </Section>
    </DocsFontScope>
  );
}
