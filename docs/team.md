# Team page

The smallest of the three pages: 51 KB, one request for the people and
nothing else. A person is a name, a designation, a group and a photograph.

## Install

1. **Create the category.** WordPress → Posts → Categories → add **Team**,
   slug exactly `team`. Nothing appears until this exists.
2. **Exclude it from the blog** the same way you did for Publications, so
   people do not turn up as news posts.
3. **Create the page** and edit it in Elementor.
4. Drop in an **HTML** widget, full width, no padding.
5. Paste the whole of `elementor/team-page.html` and **Update**.
6. Add it to the menu.

Staff sign in exactly as they do on the other two pages. Nothing extra.

## Groups

**Board** and **Staff** to begin with. Each group becomes its own section, in
the order set in `CONFIG.groups` at the top of the script; anything else you
create appears after them, alphabetically. The filter above the sections
appears only once there is more than one group.

To add a third group — Patrons, Chaplains, Volunteers — add it to
`CONFIG.groups` and it appears in the panel's dropdown.

## Adding someone

Open the page while logged in, press **OPEN PANEL**, then **Add a person**.

| Field | Notes |
| --- | --- |
| Full name | As it should be shown, including Sr., Bro., Fr. |
| Designation | Free text, with the common ones offered as you type |
| Group | Board or Staff |
| Photograph | Upload from the phone, or paste a link already in the media library |
| Short biography | Optional. Only people who have one are clickable |
| Display order | Lower comes first. Chair 10, vice chair 20, treasurer 30, members 50 |

The photograph goes into the ordinary WordPress media library, so it can be
reused and deleted the ordinary way. The medium-large copy is used rather
than the original, because a phone photograph is often several megabytes.

Nobody needs a photograph. Without one the card shows the person's initials
on a coloured panel, and the honorific is left out — Sr. Joyce Nyagucha
becomes JN, not SJ.

## Photographs

Portrait orientation, face near the top. The card crops to 4:5 and biases
the crop upwards, which is where a face sits in a passport photograph.

If all you have is a print, photograph it square-on in good light and send
it through `tools/crop-portraits.mjs`, which straightens it, cuts the paper
away and frames head and shoulders. That is how the board portraits in
`assets/team/` were made.

## Safeguarding

- Use a photograph the person has agreed may appear on a public website.
  A photograph taken at a meeting is not consent to publish it.
- Staff working directly with survivors may prefer a first name and a role,
  or a role with no photograph at all. Both work here.
- A biography is optional and public. Nothing in it should locate a shelter
  or identify anyone the person works with.

## Removing someone

**Manage** tab → trash icon. They leave the page immediately and can be
restored from WordPress for 30 days. The photograph stays in the media
library until it is deleted there.

## Notes

- Deep links work: opening a profile puts `?person=<slug>` in the address
  bar, and that link opens straight into it.
- Two portraits to a row on a phone, all the way down to a 320px screen. One
  card per screen would turn a board of ten into ten screens of scrolling.
- Term names are decoded once, so an ampersand in a group name reads as one.

## Tests

```
cd test && node team.mjs
```

43 checks: sections, display order, monograms, the group filter, the
profile, deep links, portraits, the staff panel including a photo upload,
and mobile layout at 360x800 and iPhone 14. Most of the run blocks the photo
host, which also proves the page is complete without it.
