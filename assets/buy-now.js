<?php
/**
 * Plugin Name: WooCommerce Buy Now Button
 * Plugin URI: https://yourwebsite.com
 * Description: Adds "Buy Now" buttons throughout your WooCommerce store - product pages, category pages, Elementor, and more. Redirects directly to checkout.
 * Version: 1.0.0
 * Author: Your Name
 * Author URI: https://yourwebsite.com
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
                class="<?php echo esc_attr( $button_class ); ?>" 
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
                class="<?php echo esc_attr( $button_class ); ?> buy-now-loop" 
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
    public function enqueue_scripts() {
        if ( ! is_woocommerce() && ! is_cart() ) {
            return;
        }
        
        wp_enqueue_script( 
            'wc-buy-now', 
            WC_BUY_NOW_PLUGIN_URL . 'assets/buy-now.js', 
            array( 'jquery' ), 
            WC_BUY_NOW_VERSION, 
            true 
        );
        
        wp_localize_script( 'wc-buy-now', 'wc_buy_now_params', array(
            'ajax_url' => admin_url( 'admin-ajax.php' ),
            'nonce' => wp_create_nonce( 'buy_now_nonce' ),
            'checkout_url' => wc_get_checkout_url(),
            'loading_text' => __( 'Processing...', 'wc-buy-now' ),
            'error_message' => __( 'Something went wrong. Please try again.', 'wc-buy-now' )
        ) );
        
        // Inline styles
        $custom_css = "
        .buy-now-button {
            background-color: " . get_option( 'wc_buy_now_bg_color', '#ff6b35' ) . " !important;
            color: " . get_option( 'wc_buy_now_text_color', '#ffffff' ) . " !important;
            border: none !important;
            padding: 10px 20px !important;
            margin: 10px 5px !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            transition: all 0.3s ease !important;
            text-transform: uppercase !important;
            font-weight: bold !important;
        }
        .buy-now-button:hover {
            opacity: 0.8 !important;
            transform: translateY(-2px) !important;
        }
        .buy-now-button:disabled {
            opacity: 0.6 !important;
            cursor: not-allowed !important;
        }
        .buy-now-loop {
            display: block !important;
            width: 100% !important;
            text-align: center !important;
        }
        ";
        wp_add_inline_style( 'woocommerce-general', $custom_css );
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
     * Admin menu
     */
    public function add_admin_menu() {
        add_submenu_page(
            'woocommerce',
            __( 'Buy Now Settings', 'wc-buy-now' ),
            __( 'Buy Now', 'wc-buy-now' ),
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
                        <td><input type="text" name="wc_buy_now_button_class" value="<?php echo esc_attr( get_option( 'wc_buy_now_button_class', 'button buy-now-button' ) ); ?>" /></td>
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
        add_option( 'wc_buy_now_button_text', __( 'Buy Now', 'wc-buy-now' ) );
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

/**
 * Create the JavaScript file content
 * Save this as assets/buy-now.js in your plugin folder
 */
function create_buy_now_js_file() {
    $js_content = "
jQuery(document).ready(function($) {
    // Handle Buy Now button clicks
    $(document).on('click', '.buy-now-button', function(e) {
        e.preventDefault();
        
        var button = $(this);
        var productId = button.data('product-id');
        var productType = button.data('product-type');
        var originalText = button.text();
        
        // Disable button and show loading
        button.prop('disabled', true).text(wc_buy_now_params.loading_text);
        
        // Handle variable products
        if (productType === 'variable') {
            var variationId = 0;
            var variationForm = button.closest('form.variations_form');
            
            if (variationForm.length > 0) {
                variationId = variationForm.find('[name=\"variation_id\"]').val();
                if (!variationId || variationId === '0') {
                    alert('Please select product options before buying.');
                    button.prop('disabled', false).text(originalText);
                    return;
                }
            }
        }
        
        // Get quantity
        var quantity = 1;
        var quantityInput = button.closest('form').find('[name=\"quantity\"]');
        if (quantityInput.length > 0) {
            quantity = quantityInput.val();
        }
        
        // AJAX request
        $.ajax({
            url: wc_buy_now_params.ajax_url,
            type: 'POST',
            data: {
                action: 'wc_buy_now',
                product_id: productId,
                quantity: quantity,
                variation_id: variationId || 0,
                security: wc_buy_now_params.nonce
            },
            success: function(response) {
                if (response.success) {
                    // Redirect to checkout
                    window.location.href = response.data.redirect;
                } else {
                    alert(response.data.message || wc_buy_now_params.error_message);
                    button.prop('disabled', false).text(originalText);
                }
            },
            error: function() {
                alert(wc_buy_now_params.error_message);
                button.prop('disabled', false).text(originalText);
            }
        });
    });
    
    // Handle single product page forms
    $('form.cart').on('submit', function(e) {
        var form = $(this);
        var buyNowClicked = form.data('buy-now-clicked');
        
        if (buyNowClicked) {
            e.preventDefault();
            form.removeData('buy-now-clicked');
            
            var formData = form.serialize() + '&buy_now=1&buy_now_nonce=' + wc_buy_now_params.nonce;
            
            $.post(window.location.href, formData, function() {
                window.location.href = wc_buy_now_params.checkout_url;
            });
        }
    });
    
    // Mark form when Buy Now is clicked on single product
    $('.single-product .buy-now-button').on('click', function(e) {
        $(this).closest('form').data('buy-now-clicked', true);
    });
});
";
    
    // Create assets directory and file
    $upload_dir = wp_upload_dir();
    $plugin_dir = $upload_dir['basedir'] . '/wc-buy-now-assets/';
    
    if (!file_exists($plugin_dir)) {
        wp_mkdir_p($plugin_dir);
    }
    
    file_put_contents($plugin_dir . 'buy-now.js', $js_content);
}

// Create JS file on plugin activation
register_activation_hook(__FILE__, 'create_buy_now_js_file');
?>