# Videos page

A companion to the publications library, kept deliberately small. A video is a
link, so nothing is uploaded and no cover image is needed. The built page is
about 55 KB against the publications page's 173 KB, and no YouTube or Vimeo
code loads at all until a visitor presses play.

## Install

1. **Create the category.** WordPress → Posts → Categories → add **Videos**,
   slug exactly `videos`. Nothing appears until this exists.
2. **Exclude it from the blog** the same way you did for Publications, so
   videos do not turn up as news posts.
3. **Create the page** and edit it in Elementor.
4. Drop in an **HTML** widget, full width, no padding.
5. Paste the whole of `elementor/videos-page.html` and **Update**.
6. Add it to the menu.

Staff sign in exactly as they do on the publications page — automatically if
`plugin/tkpub-nonce-snippet.php` is installed, otherwise with an Application
Password. Nothing extra to set up.

## Adding a video

Open the page while logged in, press **OPEN PANEL**, then **Add a video**.

| Field | Notes |
| --- | --- |
| Video link | The only field that really matters. Paste the YouTube or Vimeo link |
| Title | What it is |
| Short description | One or two sentences |
| Type | Exactly one — see below |
| Date | Drives the ordering |
| Themes | One to three, led by the four Ps |
| Keywords | Comma separated: places, partners, target groups |
| Length | Optional, e.g. `4:32`. Shown on the thumbnail |
| Feature this | Puts it in the large slot at the top |

The thumbnail appears as soon as you paste the link. If it does not, the link
is wrong — fix it before publishing rather than after.

Save as a **draft** first, look at the page, then publish. Same rule as
documents.

## Link formats that work

All of these are recognised:

```
https://www.youtube.com/watch?v=CeH4o97KKPM
https://youtu.be/CeH4o97KKPM
https://youtu.be/CeH4o97KKPM?si=AbCdEf
https://www.youtube.com/shorts/CeH4o97KKPM
https://www.youtube.com/live/CeH4o97KKPM
https://vimeo.com/123456789
```

Anything else still publishes — the card simply opens the link on its original
site instead of playing in the page. The panel tells you which of the two you
are about to get.

## Types

Pick exactly one. These describe the shape of the video, not its subject.

| Type | Use it for |
| --- | --- |
| Awareness Video | Made to inform the public about trafficking |
| Testimony | Someone speaking from their own experience |
| Training | Instructional material for facilitators, staff or students |
| Event Highlights | A record of a workshop, summit or launch |
| Interview | A conversation with one person or partner |
| Prayer & Reflection | Liturgical or devotional material |
| Documentary | Longer-form storytelling |
| Public Service Announcement | Short broadcast or social spot |

Themes are the same twelve used for publications, so staff learn one system:
Prevention, Protection, Partnership and Prayer first, then Child Trafficking,
Labour Exploitation, Safe Migration, Survivor Care, Digital Safety, Youth &
Schools, Advocacy, Faith Formation.

## Safeguarding

Video carries more risk than a document, because a face cannot be anonymised
after the fact.

- If anyone in the video could be identified as a survivor, **written consent
  must be on file** before it goes anywhere near this page.
- The same applies to any child, whether or not the subject is trafficking.
- Check the background as well as the subject: shelter exteriors, street signs
  and vehicle plates all locate a place you may not want located.
- If you are unsure, save it as a draft and ask the coordinator. A draft is
  visible only to signed-in staff.
- A video already public on YouTube is not automatically cleared for this
  page. Consent given for one audience is not consent for another.

## Removing a video

**Manage** tab → trash icon. It leaves the page immediately and can be
restored from WordPress for 30 days. To take something down without breaking
links people have already shared, set it to Draft instead.

Deleting the entry here does not touch the video on YouTube.

## Notes

- The player uses YouTube's **no-cookie** host, so a visitor who never presses
  play is not tracked.
- The iframe is created on the tap that plays it and destroyed when the player
  closes, so nothing keeps running in the background.
- Vimeo videos have no free thumbnail, so they get a branded cover instead.
- Deep links work: opening a video puts `?video=<slug>` in the address bar, and
  that link opens straight into it.

## Tests

```
cd test && node videos.mjs
```

37 checks: rendering, filters, search, the player, deep links, the staff panel,
and mobile layout at 360x800 and iPhone 14. Thumbnail and player hosts are
blocked during the run, so every assertion also proves the page still works
when YouTube is unreachable.
