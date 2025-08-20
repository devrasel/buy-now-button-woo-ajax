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
        var variationId = 0;
        if (productType === 'variable') {
            var variationForm = button.closest('form.variations_form');
            
            if (variationForm.length > 0) {
                variationId = variationForm.find('[name="variation_id"]').val();
                if (!variationId || variationId === '0') {
                    alert('Please select product options before buying.');
                    button.prop('disabled', false).text(originalText);
                    return;
                }
            }
        }
        
        // Get quantity
        var quantity = 1;
        var quantityInput = button.closest('form').find('[name="quantity"]');
        if (quantityInput.length > 0) {
            quantity = quantityInput.val() || 1;
        }
        
        // For loop products, get quantity from data attribute or default to 1
        if (button.hasClass('buy-now-loop')) {
            quantity = button.data('quantity') || 1;
        }
        
        // AJAX request
        $.ajax({
            url: wc_buy_now_params.ajax_url,
            type: 'POST',
            data: {
                action: 'wc_buy_now',
                product_id: productId,
                quantity: quantity,
                variation_id: variationId,
                security: wc_buy_now_params.nonce
            },
            success: function(response) {
                if (response.success) {
                    // Show success message briefly then redirect
                    button.text('Loading..');
                    setTimeout(function() {
                        window.location.href = response.data.redirect;
                    }, 500);
                } else {
                    alert(response.data.message || wc_buy_now_params.error_message);
                    button.prop('disabled', false).text(originalText);
                }
            },
            error: function(xhr, status, error) {
                console.error('Buy Now Error:', error);
                alert(wc_buy_now_params.error_message);
                button.prop('disabled', false).text(originalText);
            }
        });
    });
    
    // Handle single product page forms with Buy Now
    $('form.cart').on('submit', function(e) {
        var form = $(this);
        var buyNowClicked = form.data('buy-now-clicked');
        
        if (buyNowClicked) {
            e.preventDefault();
            form.removeData('buy-now-clicked');
            
            // Get form data
            var formData = form.serializeArray();
            var productId = form.find('[name="add-to-cart"]').val() || form.find('[name="product_id"]').val();
            var quantity = form.find('[name="quantity"]').val() || 1;
            var variationId = form.find('[name="variation_id"]').val() || 0;
            
            // Show loading on the buy now button
            var buyNowBtn = form.find('.buy-now-button');
            var originalText = buyNowBtn.text();
            buyNowBtn.prop('disabled', true).text(wc_buy_now_params.loading_text);
            
            // AJAX request for single product page
            $.ajax({
                url: wc_buy_now_params.ajax_url,
                type: 'POST',
                data: {
                    action: 'wc_buy_now',
                    product_id: productId,
                    quantity: quantity,
                    variation_id: variationId,
                    security: wc_buy_now_params.nonce
                },
                success: function(response) {
                    if (response.success) {
                        buyNowBtn.text('Loading..');
                        window.location.href = response.data.redirect;
                    } else {
                        alert(response.data.message || wc_buy_now_params.error_message);
                        buyNowBtn.prop('disabled', false).text(originalText);
                    }
                },
                error: function() {
                    alert(wc_buy_now_params.error_message);
                    buyNowBtn.prop('disabled', false).text(originalText);
                }
            });
        }
    });
    
    // Mark form when Buy Now is clicked on single product page
    $('.single-product .buy-now-button').on('click', function(e) {
        e.preventDefault();
        var form = $(this).closest('form.cart');
        
        if (form.length > 0) {
            // Trigger form validation first
            if (form.find('[name="variation_id"]').length > 0) {
                var variationId = form.find('[name="variation_id"]').val();
                if (!variationId || variationId === '0') {
                    alert('Please select product options before buying.');
                    return false;
                }
            }
            
            form.data('buy-now-clicked', true);
            form.submit();
        } else {
            // Handle as regular button click if no form found
            $(this).trigger('click');
        }
    });
    
    // Add loading styles dynamically
    $('<style>')
        .prop('type', 'text/css')
        .html(`
            .buy-now-button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                pointer-events: none;
            }
            .buy-now-button.loading {
                position: relative;
            }
            .buy-now-button.loading::after {
                content: '';
                position: absolute;
                width: 16px;
                height: 16px;
                margin: auto;
                border: 2px solid transparent;
                border-top-color: currentColor;
                border-radius: 50%;
                animation: button-loading-spinner 1s ease infinite;
                top: 0;
                bottom: 0;
                left: 0;
                right: 0;
            }
            @keyframes button-loading-spinner {
                from { transform: rotate(0turn); }
                to { transform: rotate(1turn); }
            }
        `)
        .appendTo('head');
    
    // Enhanced error handling for network issues
    $(document).ajaxError(function(event, xhr, settings, error) {
        if (settings.data && settings.data.includes('action=wc_buy_now')) {
            console.error('Buy Now AJAX Error:', {
                status: xhr.status,
                statusText: xhr.statusText,
                responseText: xhr.responseText,
                error: error
            });
        }
    });
    
    // Handle Elementor product widgets
    if (typeof elementorFrontend !== 'undefined') {
        elementorFrontend.hooks.addAction('frontend/element_ready/wc-products.default', function($scope) {
            // Re-initialize buy now buttons in Elementor widgets
            $scope.find('.buy-now-button').off('click').on('click', function(e) {
                // Use the same handler as above
                $(document).find('.buy-now-button').trigger('click');
            });
        });
    }
    
    // Support for infinite scroll and AJAX-loaded content
    $(document).on('DOMNodeInserted', function(e) {
        if ($(e.target).hasClass('product') || $(e.target).find('.product').length > 0) {
            // Reinitialize event handlers for dynamically loaded products
            $(e.target).find('.buy-now-button').off('click');
        }
    });
	
	// Rebind on product widget reload
jQuery(document).on('elementor-pro/frontend/element_ready/woocommerce-products.default', function() {
    initBuyNowButtons();
	console.log('Binding Buy Now buttons');

});

});

