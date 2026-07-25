<?php
/**
 * Plugin Name:       Talitha Kum Publications
 * Plugin URI:        https://talithakumraht.org/
 * Description:       Custom post type, taxonomies, meta fields and REST conveniences powering the Talitha Kum RAHT Kenya publications repository ("cpt" mode of the front-end publications page).
 * Version:           1.0.0
 * Author:            Talitha Kum RAHT Kenya
 * Author URI:        https://talithakumraht.org/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       talithakum-publications
 * Requires PHP:      7.4
 * Requires at least: 5.9
 *
 * =============================================================================
 * INSTALLATION
 * =============================================================================
 *
 * A) As a normal plugin
 *    1. Upload this single file to  wp-content/plugins/talithakum-publications/talithakum-publications.php
 *       (or drop it straight in as  wp-content/plugins/talithakum-publications.php — both work).
 *    2. Dashboard > Plugins > "Talitha Kum Publications" > Activate.
 *    3. Activation registers everything, seeds the default terms and flushes rewrite rules.
 *
 * B) As a must-use (mu) plugin — cannot be deactivated by editors, survives theme changes
 *    1. Create  wp-content/mu-plugins/  if it does not exist.
 *    2. Copy this file to  wp-content/mu-plugins/talithakum-publications.php
 *    3. Done — mu-plugins load automatically. Activation hooks NEVER fire for mu-plugins,
 *       so this plugin also seeds terms idempotently on `init` behind the option flag
 *       `tkpub_seeded_version`, and flushes rewrite rules once via `tkpub_flush_rewrite`.
 *       If publication permalinks 404, just visit Settings > Permalinks once.
 *
 * =============================================================================
 * REST ENDPOINTS THE FRONT-END SHOULD CALL IN cpt-MODE
 * =============================================================================
 *
 *   Publications collection (read)
 *     GET  /wp-json/wp/v2/publications?per_page=100&page=1&orderby=date&order=desc&_embed=1
 *
 *   Single publication (read)
 *     GET  /wp-json/wp/v2/publications/<id>
 *
 *   Create / update a publication (Application Password, HTTP Basic over HTTPS)
 *     POST /wp-json/wp/v2/publications
 *     POST /wp-json/wp/v2/publications/<id>
 *
 *   Media upload (the PDF itself, and the cover image)
 *     POST /wp-json/wp/v2/media
 *
 *   Taxonomy term lists (for building the filter UI)
 *     GET  /wp-json/wp/v2/publication-types?per_page=100&hide_empty=false
 *     GET  /wp-json/wp/v2/publication-themes?per_page=100&hide_empty=false
 *     GET  /wp-json/wp/v2/tags?per_page=100&hide_empty=false
 *
 *   Download counter (public, rate limited to 1 hit per publication per IP per hour)
 *     POST /wp-json/talithakum/v1/publications/<id>/download
 *          -> { "id": 123, "downloads": 42, "counted": true }
 *
 *   Collection query args for filtering (these are the taxonomy `rest_base` names):
 *     ?publication-types=<term_id>      (comma separated IDs allowed)
 *     ?publication-themes=<term_id>     (comma separated IDs allowed)
 *     ?tags=<term_id>                   (core post_tag, attached to this CPT)
 *     ?search=<text>  ?orderby=date|title  ?order=asc|desc  ?per_page=1..100
 *
 *   Every publication response carries a read-only `tk` object with everything the
 *   front-end needs without follow-up requests:
 *     tk.pdf_url, tk.pdf_size, tk.pdf_pages, tk.cover_url, tk.cover_alt,
 *     tk.language, tk.issuer, tk.featured, tk.downloads,
 *     tk.type[]     = [ { id, name, slug }, ... ]   (tk_pub_type)
 *     tk.themes[]   = [ { id, name, slug }, ... ]   (tk_pub_theme)
 *     tk.keywords[] = [ { id, name, slug }, ... ]   (post_tag)
 *
 *   Meta keys (writable via the `meta` object on create/update, except tk_downloads):
 *     tk_pdf_url, tk_pdf_id, tk_pdf_pages, tk_pdf_size,
 *     tk_language, tk_issuer, tk_featured, tk_downloads (read-only for non-editors)
 *
 * @package TalithaKum\Publications
 */

namespace TalithaKum\Publications;

defined( 'ABSPATH' ) || exit;

const VERSION       = '1.0.0';
const POST_TYPE     = 'tk_publication';
const TAX_TYPE      = 'tk_pub_type';
const TAX_THEME     = 'tk_pub_theme';
const REST_NS       = 'talithakum/v1';
const OPT_SEEDED    = 'tkpub_seeded_version';
const OPT_FLUSH     = 'tkpub_flush_rewrite';
const DL_RATE_LIMIT = HOUR_IN_SECONDS;

/* -------------------------------------------------------------------------
 * Bootstrap
 * ---------------------------------------------------------------------- */

add_action( 'init', __NAMESPACE__ . '\\register_post_type_publication', 5 );
add_action( 'init', __NAMESPACE__ . '\\register_taxonomies', 6 );
add_action( 'init', __NAMESPACE__ . '\\register_meta_fields', 7 );
add_action( 'init', __NAMESPACE__ . '\\maybe_seed_terms', 20 );
add_action( 'init', __NAMESPACE__ . '\\maybe_flush_rewrite_rules', 99 );
add_action( 'after_setup_theme', __NAMESPACE__ . '\\ensure_thumbnail_support', 99 );
add_action( 'rest_api_init', __NAMESPACE__ . '\\register_rest_fields' );
add_action( 'rest_api_init', __NAMESPACE__ . '\\register_rest_routes' );

add_filter( 'upload_mimes', __NAMESPACE__ . '\\allow_pdf_mime' );
add_filter( 'wp_check_filetype_and_ext', __NAMESPACE__ . '\\fix_pdf_filetype', 10, 5 );
add_filter( 'rest_' . POST_TYPE . '_collection_params', __NAMESPACE__ . '\\collection_params' );

register_activation_hook( __FILE__, __NAMESPACE__ . '\\on_activate' );
register_deactivation_hook( __FILE__, __NAMESPACE__ . '\\on_deactivate' );

/**
 * Activation: register everything, seed terms, flush rewrites.
 *
 * Never fires for mu-plugins — see maybe_seed_terms() / maybe_flush_rewrite_rules().
 *
 * @return void
 */
function on_activate() {
	register_post_type_publication();
	register_taxonomies();
	register_meta_fields();
	seed_terms();
	update_option( OPT_SEEDED, VERSION, false );
	flush_rewrite_rules();
	delete_option( OPT_FLUSH );
}

/**
 * Deactivation: drop the rewrite rules we added.
 *
 * @return void
 */
function on_deactivate() {
	flush_rewrite_rules();
}

/**
 * Flush rewrite rules once when the plugin runs as an mu-plugin (no activation hook).
 *
 * @return void
 */
function maybe_flush_rewrite_rules() {
	if ( get_option( OPT_FLUSH ) === VERSION ) {
		return;
	}
	flush_rewrite_rules( false );
	update_option( OPT_FLUSH, VERSION, false );
}

/**
 * Some themes never call add_theme_support( 'post-thumbnails' ); the CPT needs it.
 *
 * @return void
 */
function ensure_thumbnail_support() {
	if ( ! current_theme_supports( 'post-thumbnails' ) ) {
		add_theme_support( 'post-thumbnails', array( POST_TYPE ) );
	}
}

/* -------------------------------------------------------------------------
 * Post type
 * ---------------------------------------------------------------------- */

/**
 * Register the tk_publication post type.
 *
 * @return void
 */
function register_post_type_publication() {
	$labels = array(
		'name'                     => __( 'Publications', 'talithakum-publications' ),
		'singular_name'            => __( 'Publication', 'talithakum-publications' ),
		'menu_name'                => __( 'Publications', 'talithakum-publications' ),
		'name_admin_bar'           => __( 'Publication', 'talithakum-publications' ),
		'add_new'                  => __( 'Add New', 'talithakum-publications' ),
		'add_new_item'             => __( 'Add New Publication', 'talithakum-publications' ),
		'new_item'                 => __( 'New Publication', 'talithakum-publications' ),
		'edit_item'                => __( 'Edit Publication', 'talithakum-publications' ),
		'view_item'                => __( 'View Publication', 'talithakum-publications' ),
		'view_items'               => __( 'View Publications', 'talithakum-publications' ),
		'all_items'                => __( 'All Publications', 'talithakum-publications' ),
		'search_items'             => __( 'Search Publications', 'talithakum-publications' ),
		'parent_item_colon'        => __( 'Parent Publication:', 'talithakum-publications' ),
		'not_found'                => __( 'No publications found.', 'talithakum-publications' ),
		'not_found_in_trash'       => __( 'No publications found in Trash.', 'talithakum-publications' ),
		'featured_image'           => __( 'Cover Image', 'talithakum-publications' ),
		'set_featured_image'       => __( 'Set cover image', 'talithakum-publications' ),
		'remove_featured_image'    => __( 'Remove cover image', 'talithakum-publications' ),
		'use_featured_image'       => __( 'Use as cover image', 'talithakum-publications' ),
		'archives'                 => __( 'Publication Archives', 'talithakum-publications' ),
		'insert_into_item'         => __( 'Insert into publication', 'talithakum-publications' ),
		'uploaded_to_this_item'    => __( 'Uploaded to this publication', 'talithakum-publications' ),
		'filter_items_list'        => __( 'Filter publications list', 'talithakum-publications' ),
		'items_list_navigation'    => __( 'Publications list navigation', 'talithakum-publications' ),
		'items_list'               => __( 'Publications list', 'talithakum-publications' ),
		'item_published'           => __( 'Publication published.', 'talithakum-publications' ),
		'item_updated'             => __( 'Publication updated.', 'talithakum-publications' ),
		'item_link'                => __( 'Publication Link', 'talithakum-publications' ),
		'item_link_description'    => __( 'A link to a publication.', 'talithakum-publications' ),
	);

	register_post_type(
		POST_TYPE,
		array(
			'labels'          => $labels,
			'description'     => __( 'Talitha Kum RAHT Kenya publications repository.', 'talithakum-publications' ),
			'public'          => true,
			'publicly_queryable' => true,
			'show_ui'         => true,
			'show_in_menu'    => true,
			'show_in_nav_menus' => true,
			'show_in_admin_bar' => true,
			'has_archive'     => false,
			'hierarchical'    => false,
			'menu_position'   => 21,
			'menu_icon'       => 'dashicons-media-document',
			'capability_type' => 'post',
			'map_meta_cap'    => true,
			'supports'        => array( 'title', 'editor', 'excerpt', 'thumbnail', 'revisions', 'author', 'custom-fields' ),
			'taxonomies'      => array( TAX_TYPE, TAX_THEME, 'post_tag' ),
			'rewrite'         => array(
				'slug'       => 'publications',
				'with_front' => false,
			),
			'show_in_rest'    => true,
			'rest_base'       => 'publications',
			'rest_controller_class' => 'WP_REST_Posts_Controller',
		)
	);
}

/* -------------------------------------------------------------------------
 * Taxonomies
 * ---------------------------------------------------------------------- */

/**
 * Register tk_pub_type + tk_pub_theme and attach core post_tag to the CPT.
 *
 * @return void
 */
function register_taxonomies() {
	register_taxonomy(
		TAX_TYPE,
		array( POST_TYPE ),
		array(
			'labels'             => tax_labels(
				__( 'Publication Type', 'talithakum-publications' ),
				__( 'Publication Types', 'talithakum-publications' )
			),
			'description'        => __( 'The kind of document (annual report, policy brief, newsletter...).', 'talithakum-publications' ),
			'hierarchical'       => true,
			'public'             => true,
			'publicly_queryable' => true,
			'show_ui'            => true,
			'show_admin_column'  => true,
			'show_in_nav_menus'  => true,
			'show_tagcloud'      => false,
			'rewrite'            => array(
				'slug'       => 'publication-type',
				'with_front' => false,
			),
			'show_in_rest'       => true,
			'rest_base'          => 'publication-types',
			'rest_controller_class' => 'WP_REST_Terms_Controller',
		)
	);

	register_taxonomy(
		TAX_THEME,
		array( POST_TYPE ),
		array(
			'labels'             => tax_labels(
				__( 'Theme', 'talithakum-publications' ),
				__( 'Themes', 'talithakum-publications' )
			),
			'description'        => __( 'Subject themes addressed by the publication.', 'talithakum-publications' ),
			'hierarchical'       => false,
			'public'             => true,
			'publicly_queryable' => true,
			'show_ui'            => true,
			'show_admin_column'  => true,
			'show_in_nav_menus'  => true,
			'show_tagcloud'      => true,
			'rewrite'            => array(
				'slug'       => 'publication-theme',
				'with_front' => false,
			),
			'show_in_rest'       => true,
			'rest_base'          => 'publication-themes',
			'rest_controller_class' => 'WP_REST_Terms_Controller',
		)
	);

	// Free-form keywords reuse the core tag taxonomy (rest_base "tags").
	register_taxonomy_for_object_type( 'post_tag', POST_TYPE );
}

/**
 * Build a full taxonomy label set from a singular/plural pair.
 *
 * @param string $singular Singular label.
 * @param string $plural   Plural label.
 * @return array<string,string>
 */
function tax_labels( $singular, $plural ) {
	return array(
		'name'                       => $plural,
		'singular_name'              => $singular,
		'menu_name'                  => $plural,
		'all_items'                  => sprintf( /* translators: %s: plural taxonomy label. */ __( 'All %s', 'talithakum-publications' ), $plural ),
		'edit_item'                  => sprintf( /* translators: %s: singular taxonomy label. */ __( 'Edit %s', 'talithakum-publications' ), $singular ),
		'view_item'                  => sprintf( /* translators: %s: singular taxonomy label. */ __( 'View %s', 'talithakum-publications' ), $singular ),
		'update_item'                => sprintf( /* translators: %s: singular taxonomy label. */ __( 'Update %s', 'talithakum-publications' ), $singular ),
		'add_new_item'               => sprintf( /* translators: %s: singular taxonomy label. */ __( 'Add New %s', 'talithakum-publications' ), $singular ),
		'new_item_name'              => sprintf( /* translators: %s: singular taxonomy label. */ __( 'New %s Name', 'talithakum-publications' ), $singular ),
		'parent_item'                => sprintf( /* translators: %s: singular taxonomy label. */ __( 'Parent %s', 'talithakum-publications' ), $singular ),
		'parent_item_colon'          => sprintf( /* translators: %s: singular taxonomy label. */ __( 'Parent %s:', 'talithakum-publications' ), $singular ),
		'search_items'               => sprintf( /* translators: %s: plural taxonomy label. */ __( 'Search %s', 'talithakum-publications' ), $plural ),
		'popular_items'              => sprintf( /* translators: %s: plural taxonomy label. */ __( 'Popular %s', 'talithakum-publications' ), $plural ),
		'separate_items_with_commas' => sprintf( /* translators: %s: plural taxonomy label. */ __( 'Separate %s with commas', 'talithakum-publications' ), strtolower( $plural ) ),
		'add_or_remove_items'        => sprintf( /* translators: %s: plural taxonomy label. */ __( 'Add or remove %s', 'talithakum-publications' ), strtolower( $plural ) ),
		'choose_from_most_used'      => sprintf( /* translators: %s: plural taxonomy label. */ __( 'Choose from the most used %s', 'talithakum-publications' ), strtolower( $plural ) ),
		'not_found'                  => sprintf( /* translators: %s: plural taxonomy label. */ __( 'No %s found.', 'talithakum-publications' ), strtolower( $plural ) ),
		'back_to_items'              => sprintf( /* translators: %s: plural taxonomy label. */ __( '&larr; Go to %s', 'talithakum-publications' ), $plural ),
	);
}

/* -------------------------------------------------------------------------
 * Default terms
 * ---------------------------------------------------------------------- */

/**
 * Default terms, filterable.
 *
 * @return array<string,string[]>
 */
function default_terms() {
	return (array) apply_filters(
		'tkpub_default_terms',
		array(
			TAX_TYPE  => array(
				'Annual Report',
				'Research & Data',
				'Policy Brief',
				'Newsletter',
				'Training Manual',
				'Awareness Material',
				'Prayer & Reflection',
				'Press Release',
				'Conference Paper',
			),
			TAX_THEME => array(
				'Prevention',
				'Protection',
				'Partnership',
				'Prayer',
				'Child Trafficking',
				'Labour Exploitation',
				'Safe Migration',
				'Survivor Care',
				'Digital Safety',
				'Youth & Schools',
				'Advocacy',
				'Faith Formation',
			),
		)
	);
}

/**
 * Idempotent seed guarded by an option flag, so mu-plugin installs get terms too.
 *
 * @return void
 */
function maybe_seed_terms() {
	if ( get_option( OPT_SEEDED ) === VERSION ) {
		return;
	}
	seed_terms();
	update_option( OPT_SEEDED, VERSION, false );
}

/**
 * Insert the default terms that do not already exist. Safe to run repeatedly.
 *
 * @return void
 */
function seed_terms() {
	foreach ( default_terms() as $taxonomy => $names ) {
		if ( ! taxonomy_exists( $taxonomy ) ) {
			continue;
		}
		foreach ( (array) $names as $name ) {
			$name = trim( (string) $name );
			if ( '' === $name ) {
				continue;
			}
			if ( term_exists( $name, $taxonomy ) ) {
				continue;
			}
			$slug = sanitize_title( $name );
			if ( $slug && get_term_by( 'slug', $slug, $taxonomy ) ) {
				continue;
			}
			wp_insert_term( $name, $taxonomy, array( 'slug' => $slug ) );
		}
	}
}

/* -------------------------------------------------------------------------
 * Meta fields
 * ---------------------------------------------------------------------- */

/**
 * Allowed publication languages (filterable).
 *
 * @return string[]
 */
function languages() {
	$langs = (array) apply_filters( 'tkpub_languages', array( 'en', 'sw', 'fr' ) );
	$langs = array_values( array_filter( array_map( 'strval', $langs ) ) );

	return $langs ? $langs : array( 'en' );
}

/**
 * Sanitize a language code down to the allowed list.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function sanitize_language( $value ) {
	$langs = languages();
	$value = strtolower( sanitize_key( is_scalar( $value ) ? (string) $value : '' ) );

	return in_array( $value, $langs, true ) ? $value : $langs[0];
}

/**
 * Sanitize a URL for storage. Prefers sanitize_url() (WP 5.9+) over esc_url_raw().
 *
 * @param mixed $value Raw value.
 * @return string
 */
function sanitize_url_value( $value ) {
	$value = is_scalar( $value ) ? (string) $value : '';
	if ( '' === $value ) {
		return '';
	}

	return function_exists( 'sanitize_url' ) ? sanitize_url( $value ) : esc_url_raw( $value );
}

/**
 * Sanitize to a non-negative integer.
 *
 * @param mixed $value Raw value.
 * @return int
 */
function sanitize_uint( $value ) {
	return is_scalar( $value ) ? absint( $value ) : 0;
}

/**
 * Sanitize to a boolean.
 *
 * @param mixed $value Raw value.
 * @return bool
 */
function sanitize_bool( $value ) {
	return (bool) rest_sanitize_boolean( $value );
}

/**
 * Sanitize plain text.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function sanitize_text( $value ) {
	return sanitize_text_field( is_scalar( $value ) ? (string) $value : '' );
}

/**
 * Default auth callback: the user must be able to edit this publication
 * (falls back to the generic edit_posts capability when there is no object).
 *
 * @param bool   $allowed   Whether the user can add/edit the meta. Unused.
 * @param string $meta_key  Meta key. Unused.
 * @param int    $object_id Post ID.
 * @return bool
 */
function auth_edit( $allowed, $meta_key, $object_id ) {
	unset( $allowed, $meta_key );

	$object_id = (int) $object_id;
	if ( $object_id > 0 ) {
		return current_user_can( 'edit_post', $object_id );
	}

	return current_user_can( 'edit_posts' );
}

/**
 * Stricter auth callback for the download counter: editors only, so the public
 * REST endpoint (and any author-level Application Password) cannot set it directly.
 *
 * @param bool   $allowed   Whether the user can add/edit the meta. Unused.
 * @param string $meta_key  Meta key. Unused.
 * @param int    $object_id Post ID.
 * @return bool
 */
function auth_edit_others( $allowed, $meta_key, $object_id ) {
	unset( $allowed, $meta_key );

	$object_id = (int) $object_id;
	if ( ! current_user_can( 'edit_others_posts' ) ) {
		return false;
	}
	if ( $object_id > 0 ) {
		return current_user_can( 'edit_post', $object_id );
	}

	return true;
}

/**
 * Register all publication meta on the CPT.
 *
 * @return void
 */
function register_meta_fields() {
	$auth   = __NAMESPACE__ . '\\auth_edit';
	$fields = array(
		'tk_pdf_url'    => array(
			'type'              => 'string',
			'description'       => __( 'Direct URL to the publication PDF.', 'talithakum-publications' ),
			'default'           => '',
			'sanitize_callback' => __NAMESPACE__ . '\\sanitize_url_value',
			'auth_callback'     => $auth,
		),
		'tk_pdf_id'     => array(
			'type'              => 'integer',
			'description'       => __( 'Media attachment ID of the PDF.', 'talithakum-publications' ),
			'default'           => 0,
			'sanitize_callback' => __NAMESPACE__ . '\\sanitize_uint',
			'auth_callback'     => $auth,
		),
		'tk_pdf_pages'  => array(
			'type'              => 'integer',
			'description'       => __( 'Page count of the PDF.', 'talithakum-publications' ),
			'default'           => 0,
			'sanitize_callback' => __NAMESPACE__ . '\\sanitize_uint',
			'auth_callback'     => $auth,
		),
		'tk_pdf_size'   => array(
			'type'              => 'integer',
			'description'       => __( 'File size of the PDF in bytes.', 'talithakum-publications' ),
			'default'           => 0,
			'sanitize_callback' => __NAMESPACE__ . '\\sanitize_uint',
			'auth_callback'     => $auth,
		),
		'tk_language'   => array(
			'type'              => 'string',
			'description'       => __( 'Language code of the publication.', 'talithakum-publications' ),
			'default'           => languages()[0],
			'sanitize_callback' => __NAMESPACE__ . '\\sanitize_language',
			'auth_callback'     => $auth,
			'show_in_rest'      => array(
				'schema' => array(
					'type' => 'string',
					'enum' => languages(),
				),
			),
		),
		'tk_issuer'     => array(
			'type'              => 'string',
			'description'       => __( 'Issuing body, e.g. "RAHT Kenya".', 'talithakum-publications' ),
			'default'           => '',
			'sanitize_callback' => __NAMESPACE__ . '\\sanitize_text',
			'auth_callback'     => $auth,
		),
		'tk_featured'   => array(
			'type'              => 'boolean',
			'description'       => __( 'Whether the publication is highlighted on the archive.', 'talithakum-publications' ),
			'default'           => false,
			'sanitize_callback' => __NAMESPACE__ . '\\sanitize_bool',
			'auth_callback'     => $auth,
		),
		'tk_downloads'  => array(
			'type'              => 'integer',
			'description'       => __( 'Download counter. Incremented through the download endpoint; writable via REST by editors only.', 'talithakum-publications' ),
			'default'           => 0,
			'sanitize_callback' => __NAMESPACE__ . '\\sanitize_uint',
			'auth_callback'     => __NAMESPACE__ . '\\auth_edit_others',
		),
	);

	foreach ( $fields as $key => $args ) {
		register_post_meta(
			POST_TYPE,
			$key,
			array(
				'type'              => $args['type'],
				'description'       => $args['description'],
				'single'            => true,
				'default'           => $args['default'],
				'show_in_rest'      => isset( $args['show_in_rest'] ) ? $args['show_in_rest'] : true,
				'sanitize_callback' => $args['sanitize_callback'],
				'auth_callback'     => $args['auth_callback'],
			)
		);
	}
}

/* -------------------------------------------------------------------------
 * REST: the `tk` convenience object
 * ---------------------------------------------------------------------- */

/**
 * Register the read-only `tk` field on the publication REST response.
 *
 * @return void
 */
function register_rest_fields() {
	register_rest_field(
		POST_TYPE,
		'tk',
		array(
			'get_callback'    => __NAMESPACE__ . '\\get_tk_field',
			'update_callback' => null,
			'schema'          => array(
				'description' => __( 'Resolved publication data for the front-end archive.', 'talithakum-publications' ),
				'type'        => 'object',
				'context'     => array( 'view', 'edit', 'embed' ),
				'readonly'    => true,
				'properties'  => array(
					'pdf_url'   => array( 'type' => 'string' ),
					'pdf_size'  => array( 'type' => 'integer' ),
					'pdf_pages' => array( 'type' => 'integer' ),
					'cover_url' => array( 'type' => 'string' ),
					'cover_alt' => array( 'type' => 'string' ),
					'language'  => array( 'type' => 'string' ),
					'issuer'    => array( 'type' => 'string' ),
					'featured'  => array( 'type' => 'boolean' ),
					'downloads' => array( 'type' => 'integer' ),
					'type'      => array( 'type' => 'array' ),
					'themes'    => array( 'type' => 'array' ),
					'keywords'  => array( 'type' => 'array' ),
				),
			),
		)
	);
}

/**
 * Build the `tk` object for a publication.
 *
 * @param array<string,mixed> $post Post response array.
 * @return array<string,mixed>
 */
function get_tk_field( $post ) {
	$post_id = isset( $post['id'] ) ? (int) $post['id'] : 0;
	if ( $post_id <= 0 ) {
		return array();
	}

	$pdf_id  = (int) get_post_meta( $post_id, 'tk_pdf_id', true );
	$pdf_url = (string) get_post_meta( $post_id, 'tk_pdf_url', true );
	if ( '' === $pdf_url && $pdf_id > 0 ) {
		$attached = wp_get_attachment_url( $pdf_id );
		$pdf_url  = $attached ? $attached : '';
	}

	$pdf_size = (int) get_post_meta( $post_id, 'tk_pdf_size', true );
	if ( $pdf_size <= 0 && $pdf_id > 0 ) {
		$path = get_attached_file( $pdf_id );
		if ( $path && file_exists( $path ) ) {
			$pdf_size = (int) filesize( $path );
		}
	}

	$cover_url = '';
	$cover_alt = '';
	$thumb_id  = (int) get_post_thumbnail_id( $post_id );
	if ( $thumb_id > 0 ) {
		$src = wp_get_attachment_image_url( $thumb_id, 'medium_large' );
		if ( ! $src ) {
			$src = wp_get_attachment_image_url( $thumb_id, 'full' );
		}
		$cover_url = $src ? $src : '';
		$alt       = get_post_meta( $thumb_id, '_wp_attachment_image_alt', true );
		$cover_alt = is_string( $alt ) ? $alt : '';
		if ( '' === $cover_alt ) {
			$cover_alt = get_the_title( $post_id );
		}
	}

	return array(
		'pdf_url'   => $pdf_url,
		'pdf_size'  => $pdf_size,
		'pdf_pages' => (int) get_post_meta( $post_id, 'tk_pdf_pages', true ),
		'cover_url' => $cover_url,
		'cover_alt' => $cover_alt,
		'language'  => sanitize_language( get_post_meta( $post_id, 'tk_language', true ) ),
		'issuer'    => (string) get_post_meta( $post_id, 'tk_issuer', true ),
		'featured'  => (bool) get_post_meta( $post_id, 'tk_featured', true ),
		'downloads' => (int) get_post_meta( $post_id, 'tk_downloads', true ),
		'type'      => terms_for( $post_id, TAX_TYPE ),
		'themes'    => terms_for( $post_id, TAX_THEME ),
		'keywords'  => terms_for( $post_id, 'post_tag' ),
	);
}

/**
 * Flatten a post's terms in a taxonomy to {id,name,slug} rows.
 *
 * @param int    $post_id  Post ID.
 * @param string $taxonomy Taxonomy name.
 * @return array<int,array<string,mixed>>
 */
function terms_for( $post_id, $taxonomy ) {
	if ( ! taxonomy_exists( $taxonomy ) ) {
		return array();
	}

	$terms = get_the_terms( $post_id, $taxonomy );
	if ( ! is_array( $terms ) ) {
		return array();
	}

	$out = array();
	foreach ( $terms as $term ) {
		if ( ! $term instanceof \WP_Term ) {
			continue;
		}
		$out[] = array(
			'id'   => (int) $term->term_id,
			'name' => $term->name,
			'slug' => $term->slug,
		);
	}

	return $out;
}

/* -------------------------------------------------------------------------
 * REST: download counter
 * ---------------------------------------------------------------------- */

/**
 * Register the public download endpoint.
 *
 * @return void
 */
function register_rest_routes() {
	register_rest_route(
		REST_NS,
		'/publications/(?P<id>\d+)/download',
		array(
			'methods'             => 'POST',
			'callback'            => __NAMESPACE__ . '\\handle_download',
			'permission_callback' => '__return_true',
			'args'                => array(
				'id' => array(
					'description'       => __( 'Publication ID.', 'talithakum-publications' ),
					'type'              => 'integer',
					'required'          => true,
					'sanitize_callback' => 'absint',
					'validate_callback' => static function ( $value ) {
						return absint( $value ) > 0;
					},
				),
			),
		)
	);
}

/**
 * Increment (rate limited) and return the download counter.
 *
 * @param \WP_REST_Request $request Request object.
 * @return \WP_REST_Response|\WP_Error
 */
function handle_download( $request ) {
	$post_id = absint( $request->get_param( 'id' ) );
	$post    = get_post( $post_id );

	if ( ! $post instanceof \WP_Post || POST_TYPE !== $post->post_type ) {
		return new \WP_Error(
			'tkpub_not_found',
			__( 'Publication not found.', 'talithakum-publications' ),
			array( 'status' => 404 )
		);
	}

	if ( 'publish' !== $post->post_status && ! current_user_can( 'read_post', $post_id ) ) {
		return new \WP_Error(
			'tkpub_not_found',
			__( 'Publication not found.', 'talithakum-publications' ),
			array( 'status' => 404 )
		);
	}

	$current   = (int) get_post_meta( $post_id, 'tk_downloads', true );
	$throttle  = 'tkpub_dl_' . md5( client_ip() . '|' . $post_id );
	$counted   = false;

	if ( false === get_transient( $throttle ) ) {
		$current = $current + 1;
		update_post_meta( $post_id, 'tk_downloads', $current );
		set_transient( $throttle, 1, DL_RATE_LIMIT );
		$counted = true;

		/**
		 * Fires after a publication download has been counted.
		 *
		 * @param int $post_id   Publication ID.
		 * @param int $downloads New download total.
		 */
		do_action( 'tkpub_download_counted', $post_id, $current );
	}

	return rest_ensure_response(
		array(
			'id'        => $post_id,
			'downloads' => $current,
			'counted'   => $counted,
		)
	);
}

/**
 * Best-effort client IP for rate limiting. Only trusts proxy headers when the
 * site explicitly opts in via the `tkpub_trust_proxy_headers` filter.
 *
 * @return string
 */
function client_ip() {
	$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? (string) wp_unslash( $_SERVER['REMOTE_ADDR'] ) : '';

	if ( apply_filters( 'tkpub_trust_proxy_headers', false ) ) {
		foreach ( array( 'HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP', 'HTTP_X_FORWARDED_FOR' ) as $header ) {
			if ( empty( $_SERVER[ $header ] ) ) {
				continue;
			}
			$candidate = (string) wp_unslash( $_SERVER[ $header ] );
			$parts     = explode( ',', $candidate );
			$candidate = trim( (string) reset( $parts ) );
			if ( '' !== $candidate ) {
				$ip = $candidate;
				break;
			}
		}
	}

	$valid = filter_var( $ip, FILTER_VALIDATE_IP );

	return $valid ? $valid : 'unknown';
}

/* -------------------------------------------------------------------------
 * Uploads + collection params
 * ---------------------------------------------------------------------- */

/**
 * Make sure PDFs are an allowed upload type.
 *
 * @param array<string,string> $mimes Allowed mime types.
 * @return array<string,string>
 */
function allow_pdf_mime( $mimes ) {
	if ( ! is_array( $mimes ) ) {
		$mimes = array();
	}
	if ( empty( $mimes['pdf'] ) ) {
		$mimes['pdf'] = 'application/pdf';
	}

	return $mimes;
}

/**
 * Some hosts' fileinfo returns an unexpected mime for PDFs, which makes REST
 * media uploads fail with "Sorry, you are not allowed to upload this file type."
 * Re-assert ext/type when the filename really is a PDF.
 *
 * @param array<string,mixed>  $data      Values for ext, type, proper_filename.
 * @param string               $file      Full path to the file.
 * @param string               $filename  The name of the file.
 * @param array<string,string>|null $mimes Allowed mimes. Unused.
 * @param string|false|null    $real_mime The actual mime type, or false/null.
 * @return array<string,mixed>
 */
function fix_pdf_filetype( $data, $file, $filename, $mimes = null, $real_mime = null ) {
	unset( $file, $mimes );

	$data = is_array( $data ) ? $data : array();
	$ext  = strtolower( (string) pathinfo( (string) $filename, PATHINFO_EXTENSION ) );

	if ( 'pdf' !== $ext ) {
		return $data;
	}

	$reported = is_string( $real_mime ) ? strtolower( $real_mime ) : '';
	$pdf_ok   = ( '' === $reported || 'application/pdf' === $reported || 'application/x-pdf' === $reported );

	if ( $pdf_ok && ( empty( $data['ext'] ) || empty( $data['type'] ) ) ) {
		$data['ext']  = 'pdf';
		$data['type'] = 'application/pdf';
	}

	return $data;
}

/**
 * Publications collection params.
 *
 * Ordering (orderby=date|title) and taxonomy filtering are core behaviour for a
 * show_in_rest post type; the query args the front-end needs are the taxonomy
 * rest_base names:  publication-types=<id>, publication-themes=<id>, tags=<id>.
 * This filter only pins the per_page ceiling at 100 in case a host or another
 * plugin has lowered it.
 *
 * @param array<string,mixed> $params Collection params.
 * @return array<string,mixed>
 */
function collection_params( $params ) {
	if ( ! is_array( $params ) ) {
		return $params;
	}

	if ( isset( $params['per_page'] ) && is_array( $params['per_page'] ) ) {
		$params['per_page']['maximum'] = 100;
		$params['per_page']['minimum'] = 1;
	}

	if ( isset( $params['orderby']['enum'] ) && is_array( $params['orderby']['enum'] ) ) {
		foreach ( array( 'date', 'title' ) as $order_key ) {
			if ( ! in_array( $order_key, $params['orderby']['enum'], true ) ) {
				$params['orderby']['enum'][] = $order_key;
			}
		}
	}

	return $params;
}
