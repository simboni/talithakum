<?php
/**
 * Plugin Name:       Talitha Kum Publications - One-Click Sign In
 * Description:       Lets logged-in staff use the publishing panel without typing an Application Password.
 * Version:           1.0.0
 * Author:            Talitha Kum Kenya
 * License:           GPL-2.0-or-later
 * Requires PHP:      7.4
 * Requires at least: 5.6
 *
 * =============================================================================
 * WHAT THIS DOES, AND WHY IT IS NEEDED
 * =============================================================================
 *
 * The publications page can publish using the WordPress login cookie the staff
 * member already has - but WordPress will not accept a cookie-authenticated
 * write without a matching "nonce": a short-lived, per-user token.
 *
 * That is a deliberate protection, not an inconvenience. Without it, any other
 * website could quietly make a logged-in editor's browser create posts on this
 * site (a CSRF attack). The nonce proves the request came from a real page on
 * this site, opened by that user.
 *
 * Only the server can mint one, which is why plain HTML in Elementor cannot.
 * These few lines print it into the page for logged-in staff. The publishing
 * panel picks it up automatically and skips the sign-in form.
 *
 * The nonce is printed ONLY for users who can already edit posts, so it is
 * never exposed to visitors. It expires on its own (WordPress default is 24
 * hours); when it does, the panel quietly falls back to asking for an
 * Application Password.
 *
 * =============================================================================
 * HOW TO INSTALL - pick whichever you find easiest
 * =============================================================================
 *
 * A) With the "Code Snippets" plugin (easiest, no files to touch)
 *    1. Plugins > Add New > search "Code Snippets" > Install > Activate.
 *    2. Snippets > Add New. Title it "Publications one-click sign in".
 *    3. Copy everything BELOW the line marked "SNIPPET STARTS HERE" - do not
 *       include the <?php line or this comment block.
 *    4. Choose "Run snippet everywhere", Save Changes and Activate.
 *
 * B) As a small plugin file
 *    1. Upload this whole file to
 *         wp-content/plugins/tkpub-nonce-snippet.php
 *    2. Plugins > "Talitha Kum Publications - One-Click Sign In" > Activate.
 *
 * C) As a must-use plugin (cannot be switched off by accident)
 *    1. Create wp-content/mu-plugins/ if it does not exist.
 *    2. Copy this file to wp-content/mu-plugins/tkpub-nonce-snippet.php
 *
 * Do NOT paste this into the Elementor HTML widget. It is PHP; it runs on the
 * server, not in the page.
 *
 * You do not need this file at all if you are happy for staff to sign in with
 * an Application Password. It only removes that step.
 *
 * @package TalithaKum\Publications
 */

defined( 'ABSPATH' ) || exit;

/* ============================ SNIPPET STARTS HERE ========================= */

add_action(
	'wp_head',
	function () {
		// Visitors, and anyone who cannot publish, get nothing.
		if ( ! is_user_logged_in() || ! current_user_can( 'edit_posts' ) ) {
			return;
		}

		printf(
			'<script>window.tkpubNonce=%s;window.tkpubRestRoot=%s;</script>' . "\n",
			wp_json_encode( wp_create_nonce( 'wp_rest' ) ),
			wp_json_encode( esc_url_raw( rest_url() ) )
		);
	},
	5
);

/* ============================= SNIPPET ENDS HERE ========================== */
