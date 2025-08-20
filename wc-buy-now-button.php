<?php
/**
 * Plugin Name: WC Buy Now Button
 * Plugin URI: https://rankegg.com
 * Description: Adds "Buy Now" buttons throughout your WooCommerce store - product pages, category pages, Elementor, and more. Redirects directly to checkout.
 * Version: 1.0.0
 * Author: Rasel Ahmed
 * Author URI: https://rankegg.com
 * Text Domain: wc-buy-now
 * Domain Path: /languages
 * Requires at least: 5.0
 * Tested up to: 6.4
 * WC requires at least: 5.0
 * WC tested up to: 8.5
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

// Prevent direct access
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

	
/**
	 * HPOS compatibility 
	 */

add_action( 'before_woocommerce_init', function() {
	if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
	}
} );


// Define plugin constants
define( 'WC_BUY_NOW_VERSION', '1.0.0' );
define( 'WC_BUY_NOW_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'WC_BUY_NOW_PLUGIN_PATH', plugin_dir_path( __FILE__ ) );

/**
 * Main Plugin Class
 */
class WC_Buy_Now_Button {
    
    /**
     * Constructor
     */
    public function __construct() {
        add_action( 'init', array( $this, 'init' ) );
        register_activation_hook( __FILE__, array( $this, 'activate' ) );
        register_deactivation_hook( __FILE__, array( $this, 'deactivate' ) );
		add_filter( 'plugin_action_links_' . plugin_basename(__FILE__), array( $this, 'add_settings_link' ) );
    }
    
    /**
     * Initialize plugin
     */
    public function init() {
        // Check if WooCommerce is active
        if ( ! class_exists( 'WooCommerce' ) ) {
            add_action( 'admin_notices', array( $this, 'woocommerce_missing_notice' ) );
            return;
        }
        
        // Load plugin functionality
        $this->load_hooks();
        $this->load_admin();
    }
    
    /**
     * Load all hooks
     */
    private function load_hooks() {
        // Add Buy Now buttons to various locations
        add_action( 'woocommerce_after_add_to_cart_button', array( $this, 'add_buy_now_button_single_product' ) );
        add_action( 'woocommerce_after_shop_loop_item', array( $this, 'add_buy_now_button_loop' ), 15 );
		//add_filter( 'woocommerce_loop_add_to_cart_link', array( $this, 'add_buy_now_to_loop_button' ), 20, 2 );
        
        // Handle Buy Now functionality
        add_action( 'wp_loaded', array( $this, 'handle_buy_now_request' ), 20 );
        
        // Add AJAX support
        add_action( 'wp_ajax_wc_buy_now', array( $this, 'ajax_buy_now' ) );
        add_action( 'wp_ajax_nopriv_wc_buy_now', array( $this, 'ajax_buy_now' ) );
        
        // Enqueue scripts
        add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_scripts' ) );
        
        // Elementor support
        add_action( 'elementor/widgets/widgets_registered', array( $this, 'elementor_support' ) );
        
        // Shortcode support
        add_shortcode( 'buy_now_button', array( $this, 'buy_now_shortcode' ) );
    }
	
    
    /**
     * Load admin functionality
     */
    private function load_admin() {
        if ( is_admin() ) {
            add_action( 'admin_menu', array( $this, 'add_admin_menu' ) );
            add_action( 'admin_init', array( $this, 'admin_init' ) );
        }
    }
    
    /**
     * Add Buy Now button to single product page
     */
    public function add_buy_now_button_single_product() {
        global $product;
        
        if ( ! $product || ! $product->is_purchasable() ) {
            return;
        }
        
        $button_text = get_option( 'wc_buy_now_button_text', __( 'Buy Now', 'wc-buy-now' ) );
        $button_class = get_option( 'wc_buy_now_button_class', 'button buy-now-button' );
        
        ?>
        <button type="button" 
                class="buy-now-button <?php echo esc_attr( $button_class ); ?>" 
                data-product-id="<?php echo esc_attr( $product->get_id() ); ?>"
                data-product-type="<?php echo esc_attr( $product->get_type() ); ?>">
            <?php echo esc_html( $button_text ); ?>
        </button>
        <?php
    }
    
    /**
     * Add Buy Now button to product loops (shop, category pages)
     */
    public function add_buy_now_button_loop() {
        global $product;
        
        if ( ! $product || ! $product->is_purchasable() || $product->is_type( 'variable' ) ) {
            return;
        }
        
        $button_text = get_option( 'wc_buy_now_button_text', __( 'Buy Now', 'wc-buy-now' ) );
        $button_class = get_option( 'wc_buy_now_button_class', 'button buy-now-button' );
        
        ?>
        <button type="button" 
                class="buy-now-button <?php echo esc_attr( $button_class ); ?> buy-now-loop" 
                data-product-id="<?php echo esc_attr( $product->get_id() ); ?>"
                data-product-type="<?php echo esc_attr( $product->get_type() ); ?>">
            <?php echo esc_html( $button_text ); ?>
        </button>
        <?php
    }
    
    /**
     * Handle Buy Now request
     */
    public function handle_buy_now_request() {
        if ( ! isset( $_POST['buy_now'] ) || ! isset( $_POST['product_id'] ) ) {
            return;
        }
        
        if ( ! wp_verify_nonce( $_POST['buy_now_nonce'], 'buy_now_action' ) ) {
            wc_add_notice( __( 'Security check failed.', 'wc-buy-now' ), 'error' );
            return;
        }
        
        $product_id = absint( $_POST['product_id'] );
        $quantity = isset( $_POST['quantity'] ) ? absint( $_POST['quantity'] ) : 1;
        $variation_id = isset( $_POST['variation_id'] ) ? absint( $_POST['variation_id'] ) : 0;
        
        // Clear cart if option is enabled
        if ( get_option( 'wc_buy_now_clear_cart', 'yes' ) === 'yes' ) {
            WC()->cart->empty_cart();
        }
        
        // Add product to cart
        $cart_item_key = WC()->cart->add_to_cart( $product_id, $quantity, $variation_id );
        
        if ( $cart_item_key ) {
            // Redirect to checkout
            wp_safe_redirect( wc_get_checkout_url() );
            exit;
        } else {
            wc_add_notice( __( 'Could not add product to cart.', 'wc-buy-now' ), 'error' );
        }
    }
    
    /**
     * AJAX Buy Now handler
     */
    public function ajax_buy_now() {
        check_ajax_referer( 'buy_now_nonce', 'security' );
        
        $product_id = absint( $_POST['product_id'] );
        $quantity = isset( $_POST['quantity'] ) ? absint( $_POST['quantity'] ) : 1;
        $variation_id = isset( $_POST['variation_id'] ) ? absint( $_POST['variation_id'] ) : 0;
        
        if ( ! $product_id ) {
            wp_send_json_error( array( 'message' => __( 'Invalid product.', 'wc-buy-now' ) ) );
        }
        
        // Clear cart if option is enabled
        if ( get_option( 'wc_buy_now_clear_cart', 'yes' ) === 'yes' ) {
            WC()->cart->empty_cart();
        }
        
        // Add product to cart
        $cart_item_key = WC()->cart->add_to_cart( $product_id, $quantity, $variation_id );
        
        if ( $cart_item_key ) {
            wp_send_json_success( array( 
                'redirect' => wc_get_checkout_url(),
                'message' => __( 'Product added to cart successfully.', 'wc-buy-now' )
            ) );
        } else {
            wp_send_json_error( array( 'message' => __( 'Could not add product to cart.', 'wc-buy-now' ) ) );
        }
    }
    
    /**
     * Enqueue scripts and styles
     */
   /**
     * Enqueue scripts and styles - UPDATED VERSION
     */
    public function enqueue_scripts() {
        
        // Enqueue JavaScript
        wp_enqueue_script( 
            'wc-buy-now-js', 
            WC_BUY_NOW_PLUGIN_URL . 'assets/buy-now.js', 
            array( 'jquery', 'wc-add-to-cart' ), 
            WC_BUY_NOW_VERSION, 
            true 
        );
        
        // Localize script with parameters
        wp_localize_script( 'wc-buy-now-js', 'wc_buy_now_params', array(
            'ajax_url' => admin_url( 'admin-ajax.php' ),
            'nonce' => wp_create_nonce( 'buy_now_nonce' ),
            'checkout_url' => wc_get_checkout_url(),
            'loading_text' => __( 'Loading...', 'wc-buy-now' ),
            'success_text' => __( 'Success..', 'wc-buy-now' ),
            'error_message' => __( 'Something went wrong. Please try again.', 'wc-buy-now' ),
            'select_options' => __( 'Please select product options before buying.', 'wc-buy-now' ),
            'currency_symbol' => get_woocommerce_currency_symbol(),
            'is_admin' => is_admin() ? 'yes' : 'no'
        ) );
        
        // Enqueue CSS
        wp_enqueue_style( 
            'wc-buy-now-css', 
            WC_BUY_NOW_PLUGIN_URL . 'assets/buy-now.css', 
            array( 'woocommerce-general' ), 
            WC_BUY_NOW_VERSION 
        );
        
        // Add dynamic CSS for customization
        $this->add_dynamic_css();
    }
    
    /**
     * Add dynamic CSS based on admin settings
     */
    private function add_dynamic_css() {
        $bg_color = get_option( 'wc_buy_now_bg_color', '#ff6b35' );
        $text_color = get_option( 'wc_buy_now_text_color', '#ffffff' );
        $border_radius = get_option( 'wc_buy_now_border_radius', '4px' );
        
        // Calculate hover color (darker version of bg color)
        $hover_color = $this->darken_color( $bg_color, 20 );
        
        $custom_css = "
        .buy-now-button {
            background-color: {$bg_color} !important;
            color: {$text_color} !important;
            border-radius: {$border_radius} !important;
        }
        .buy-now-button:hover {
            background-color: {$hover_color} !important;
            color: {$text_color} !important;
            box-shadow: 0 4px 8px rgba(" . $this->hex_to_rgb( $bg_color ) . ", 0.3) !important;
        }
        .buy-now-button:focus {
            outline: 2px solid {$bg_color} !important;
        }
        .product.onsale .buy-now-button {
            background-color: {$bg_color} !important;
        }
        .product.onsale .buy-now-button:hover {
            background-color: {$hover_color} !important;
        }
        ";
        
        wp_add_inline_style( 'wc-buy-now-css', $custom_css );
    }
    
    /**
     * Darken a hex color
     */
    private function darken_color( $hex, $percent ) {
        $hex = str_replace( '#', '', $hex );
        
        if ( strlen( $hex ) == 3 ) {
            $hex = str_repeat( substr( $hex, 0, 1 ), 2 ) . str_repeat( substr( $hex, 1, 1 ), 2 ) . str_repeat( substr( $hex, 2, 1 ), 2 );
        }
        
        $rgb = array(
            hexdec( substr( $hex, 0, 2 ) ),
            hexdec( substr( $hex, 2, 2 ) ),
            hexdec( substr( $hex, 4, 2 ) )
        );
        
        for ( $i = 0; $i < 3; $i++ ) {
            $rgb[$i] = max( 0, min( 255, $rgb[$i] - ( $rgb[$i] * $percent / 100 ) ) );
        }
        
        return '#' . sprintf( '%02x%02x%02x', $rgb[0], $rgb[1], $rgb[2] );
    }
    
    /**
     * Convert hex to RGB
     */
    private function hex_to_rgb( $hex ) {
        $hex = str_replace( '#', '', $hex );
        
        if ( strlen( $hex ) == 3 ) {
            $r = hexdec( str_repeat( substr( $hex, 0, 1 ), 2 ) );
            $g = hexdec( str_repeat( substr( $hex, 1, 1 ), 2 ) );
            $b = hexdec( str_repeat( substr( $hex, 2, 1 ), 2 ) );
        } else {
            $r = hexdec( substr( $hex, 0, 2 ) );
            $g = hexdec( substr( $hex, 2, 2 ) );
            $b = hexdec( substr( $hex, 4, 2 ) );
        }
        
        return "$r, $g, $b";
    }
    
    /**
     * Buy Now shortcode
     */
    public function buy_now_shortcode( $atts ) {
        $atts = shortcode_atts( array(
            'id' => 0,
            'text' => get_option( 'wc_buy_now_button_text', __( 'Buy Now', 'wc-buy-now' ) ),
            'class' => 'button buy-now-button'
        ), $atts );
        
        if ( ! $atts['id'] ) {
            return '<p>' . __( 'Product ID is required.', 'wc-buy-now' ) . '</p>';
        }
        
        $product = wc_get_product( $atts['id'] );
        if ( ! $product || ! $product->is_purchasable() ) {
            return '<p>' . __( 'Product not available.', 'wc-buy-now' ) . '</p>';
        }
        
        return sprintf(
            '<button type="button" class="%s" data-product-id="%d" data-product-type="%s">%s</button>',
            esc_attr( $atts['class'] ),
            intval( $atts['id'] ),
            esc_attr( $product->get_type() ),
            esc_html( $atts['text'] )
        );
    }
    
    /**
     * Elementor support
     */
    public function elementor_support() {
        // Add hook for Elementor Pro product widgets
        add_action( 'elementor_pro/modules/woocommerce/widgets/products/content_template_loop_item', array( $this, 'elementor_buy_now_button' ) );
    }
    
    public function elementor_buy_now_button() {
        if ( is_admin() ) return; // Don't show in editor
        $this->add_buy_now_button_loop();
    }
    
	 /**
     * Settings link to plugin admin
     */
	public function add_settings_link( $links ) {
			$settings_url = admin_url( 'admin.php?page=wc-buy-now-settings' ); // Replace with your actual settings slug
			$settings_link = '<a href="' . esc_url( $settings_url ) . '">' . __( 'Settings', 'wc-buy-now' ) . '</a>';
			array_unshift( $links, $settings_link );
			return $links;
		}

    /**
     * Admin menu
     */
    public function add_admin_menu() {
        add_submenu_page(
            'woocommerce',
            __( 'Buy Now Settings', 'wc-buy-now' ),
            __( 'Buy Now Button', 'wc-buy-now' ),
            'manage_woocommerce',
            'wc-buy-now-settings',
            array( $this, 'admin_page' )
        );
    }
    
    /**
     * Admin init
     */
    public function admin_init() {
        register_setting( 'wc_buy_now_settings', 'wc_buy_now_button_text' );
        register_setting( 'wc_buy_now_settings', 'wc_buy_now_button_class' );
        register_setting( 'wc_buy_now_settings', 'wc_buy_now_bg_color' );
        register_setting( 'wc_buy_now_settings', 'wc_buy_now_text_color' );
        register_setting( 'wc_buy_now_settings', 'wc_buy_now_clear_cart' );
        register_setting( 'wc_buy_now_settings', 'wc_buy_now_show_single' );
        register_setting( 'wc_buy_now_settings', 'wc_buy_now_show_loop' );
    }
    
    /**
     * Admin page
     */
    public function admin_page() {
        if ( isset( $_POST['submit'] ) ) {
            update_option( 'wc_buy_now_button_text', sanitize_text_field( $_POST['wc_buy_now_button_text'] ) );
            update_option( 'wc_buy_now_button_class', sanitize_text_field( $_POST['wc_buy_now_button_class'] ) );
            update_option( 'wc_buy_now_bg_color', sanitize_hex_color( $_POST['wc_buy_now_bg_color'] ) );
            update_option( 'wc_buy_now_text_color', sanitize_hex_color( $_POST['wc_buy_now_text_color'] ) );
            update_option( 'wc_buy_now_clear_cart', sanitize_text_field( $_POST['wc_buy_now_clear_cart'] ) );
            update_option( 'wc_buy_now_show_single', sanitize_text_field( $_POST['wc_buy_now_show_single'] ) );
            update_option( 'wc_buy_now_show_loop', sanitize_text_field( $_POST['wc_buy_now_show_loop'] ) );
            echo '<div class="notice notice-success"><p>' . __( 'Settings saved!', 'wc-buy-now' ) . '</p></div>';
        }
        ?>
        <div class="wrap">
            <h1><?php _e( 'Buy Now Button Settings', 'wc-buy-now' ); ?></h1>
            <form method="post" action="">
                <table class="form-table">
                    <tr>
                        <th scope="row"><?php _e( 'Button Text', 'wc-buy-now' ); ?></th>
                        <td><input type="text" name="wc_buy_now_button_text" value="<?php echo esc_attr( get_option( 'wc_buy_now_button_text', 'Buy Now' ) ); ?>" /></td>
                    </tr>
                    <tr>
                        <th scope="row"><?php _e( 'CSS Class', 'wc-buy-now' ); ?></th>
                        <td><input type="text" name="wc_buy_now_button_class" value="<?php echo esc_attr( get_option( 'wc_buy_now_button_class', 'button buy-now-btn' ) ); ?>" /></td>
                    </tr>
                    <tr>
                        <th scope="row"><?php _e( 'Background Color', 'wc-buy-now' ); ?></th>
                        <td><input type="color" name="wc_buy_now_bg_color" value="<?php echo esc_attr( get_option( 'wc_buy_now_bg_color', '#ff6b35' ) ); ?>" /></td>
                    </tr>
                    <tr>
                        <th scope="row"><?php _e( 'Text Color', 'wc-buy-now' ); ?></th>
                        <td><input type="color" name="wc_buy_now_text_color" value="<?php echo esc_attr( get_option( 'wc_buy_now_text_color', '#ffffff' ) ); ?>" /></td>
                    </tr>
                    <tr>
                        <th scope="row"><?php _e( 'Clear Cart', 'wc-buy-now' ); ?></th>
                        <td>
                            <select name="wc_buy_now_clear_cart">
                                <option value="yes" <?php selected( get_option( 'wc_buy_now_clear_cart', 'yes' ), 'yes' ); ?>><?php _e( 'Yes', 'wc-buy-now' ); ?></option>
                                <option value="no" <?php selected( get_option( 'wc_buy_now_clear_cart', 'yes' ), 'no' ); ?>><?php _e( 'No', 'wc-buy-now' ); ?></option>
                            </select>
                            <p class="description"><?php _e( 'Clear cart before adding Buy Now product', 'wc-buy-now' ); ?></p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
            
            <h2><?php _e( 'Usage Examples', 'wc-buy-now' ); ?></h2>
            <h3><?php _e( 'Shortcode Usage:', 'wc-buy-now' ); ?></h3>
            <code>[buy_now_button id="123"]</code><br>
            <code>[buy_now_button id="123" text="Buy This Now" class="custom-button"]</code>
            
            <h3><?php _e( 'Locations where Buy Now buttons appear:', 'wc-buy-now' ); ?></h3>
            <ul>
                <li>✅ Single product pages</li>
                <li>✅ Shop page</li>
                <li>✅ Category pages</li>
                <li>✅ Elementor product widgets</li>
                <li>✅ Anywhere using shortcode</li>
            </ul>
        </div>
        <?php
    }
    
    /**
     * Plugin activation
     */
    public function activate() {
        // Set default options
        add_option( 'wc_buy_now_button_text', __( 'Buy Now Button', 'wc-buy-now' ) );
        add_option( 'wc_buy_now_button_class', 'button buy-now-button' );
        add_option( 'wc_buy_now_bg_color', '#ff6b35' );
        add_option( 'wc_buy_now_text_color', '#ffffff' );
        add_option( 'wc_buy_now_clear_cart', 'yes' );
    }

    
    /**
     * Plugin deactivation
     */
    public function deactivate() {
        // Cleanup if needed
    }
    
    /**
     * WooCommerce missing notice
     */
    public function woocommerce_missing_notice() {
        ?>
        <div class="error">
            <p><?php _e( 'Buy Now Button plugin requires WooCommerce to be installed and active.', 'wc-buy-now' ); ?></p>
        </div>
        <?php
    }
}

// Initialize the plugin
new WC_Buy_Now_Button();
