define( [
            'dojo/_base/declare',
            'dojo/_base/array',
            'dojo/_base/Color',
            'dojo/on',
            'JBrowse/View/Track/WiggleBase',
            'JBrowse/View/Track/YScaleMixin',
            'JBrowse/Util',
            './_Scale'
        ],
        function( declare, array, Color, on, WiggleBase, YScaleMixin, Util, Scale ) {

var XYPlot = declare( [WiggleBase, YScaleMixin],

/**
 * Wiggle track that shows data with an X-Y plot along the reference.
 *
 * @lends JBrowse.View.Track.Wiggle.XYPlot
 * @extends JBrowse.View.Track.WiggleBase
 */
{
    _defaultConfig: function() {
        return Util.deepUpdate(
            dojo.clone( this.inherited(arguments) ),
            {
                style: {
                    pos_color: 'blue',
                    neg_color: 'red',
                    origin_color: '#888',
                    variance_band_color: 'rgba(0,0,0,0.3)'
                }
            }
        );
    },

    _getScaling: function( successCallback, errorCallback ) {

        this._getScalingStats( dojo.hitch(this, function( stats ) {

            //calculate the scaling if necessary
            if( ! this.lastScaling || ! this.lastScaling.sameStats( stats ) ) {

                var scaling = new Scale( this.config, stats );

                // bump minDisplayed to 0 if it is within 0.5% of it
                if( Math.abs( scaling.min / scaling.max ) < 0.005 )
                    scaling.min = 0;

                // update our track y-scale to reflect it
                this.makeYScale({
                    fixBounds: true,
                    min: scaling.min,
                    max: scaling.max
                });

                // and finally adjust the scaling to match the ruler's scale rounding
                scaling.min = this.ruler.scaler.bounds.lower;
                scaling.max = this.ruler.scaler.bounds.upper;
                scaling.range = scaling.max - scaling.min;

                this.lastScaling = scaling;
            }

            successCallback( this.lastScaling );
        }), errorCallback );
    },

    updateStaticElements: function( coords ) {
        this.inherited( arguments );
        this.updateYScaleFromViewDimensions( coords );
    },

    /**
     * Draw a set of features on the canvas.
     * @private
     */
    _drawFeatures: function( scale, leftBase, rightBase, block, canvas, features, featureRects, dataScale ) {
        var context = canvas.getContext('2d');
        var canvasHeight = canvas.height;
        var toY = dojo.hitch( this, function( val ) {
           return canvasHeight * ( 1-dataScale.normalize.call(this, val) );
        });
        var originY = toY( dataScale.origin );

        var disableClipMarkers = this.config.disable_clip_markers;

        dojo.forEach( features, function(f,i) {

            var fRect = featureRects[i];

            //console.log( f.get('start') +'-'+f.get('end')+':'+f.get('score') );
            var score = f.get('score');
            fRect.t = toY( score );
            //console.log( score, fRect.t );

            // draw the background color if we are configured to do so
            if( fRect.t >= 0 ) {
                var bgColor = this.getConfForFeature('style.bg_color', f );
                if( bgColor ) {
                    context.fillStyle = bgColor;
                    context.fillRect( fRect.l, 0, fRect.w, canvasHeight );
                }
            }

            if( fRect.t <= canvasHeight ) { // if the rectangle is visible at all
                if( fRect.t <= originY ) {
                    // bar goes upward
                    context.fillStyle = this.getConfForFeature('style.pos_color',f);
                    context.fillRect( fRect.l, fRect.t, fRect.w, originY-fRect.t+1);
                    if( !disableClipMarkers && fRect.t < 0 ) { // draw clip marker if necessary
                        context.fillStyle = this.getConfForFeature('style.clip_marker_color',f) || this.getConfForFeature('style.neg_color',f);
                        context.fillRect( fRect.l, 0, fRect.w, 3 );
                    }
                }
                else {
                    // bar goes downward
                    context.fillStyle = this.getConfForFeature('style.neg_color',f);
                    context.fillRect( fRect.l, originY, fRect.w, fRect.t-originY+1 );
                    if( !disableClipMarkers && fRect.t >= canvasHeight ) { // draw clip marker if necessary
                        context.fillStyle = this.getConfForFeature('style.clip_marker_color',f) || this.getConfForFeature('style.pos_color',f);
                        context.fillRect( fRect.l, canvasHeight-3, fRect.w, 3 );
                    }
                }
            }
        }, this );
    },

    /**
     * Draw anything needed after the features are drawn.
     */
    _postDraw: function( scale, leftBase, rightBase, block, canvas, features, featureRects, dataScale ) {
        var context = canvas.getContext('2d');
        var canvasHeight = canvas.height;
        var toY = dojo.hitch( this, function( val ) {
           return canvasHeight * (1-dataScale.normalize.call(this, val));
        });

        // draw the variance_band if requested
        if( this.config.variance_band ) {
            var bandPositions =
                typeof this.config.variance_band == 'object'
                    ? array.map( this.config.variance_band, function(v) { return parseFloat(v); } ).sort().reverse()
                    : [ 2, 1 ];
            this.getGlobalStats( dojo.hitch( this, function( stats ) {
                if( ('scoreMean' in stats) && ('scoreStdDev' in stats) ) {
                    var drawVarianceBand = function( plusminus, fill, label ) {
                        context.fillStyle = fill;
                        var varTop = toY( stats.scoreMean + plusminus );
                        var varHeight = toY( stats.scoreMean - plusminus ) - varTop;
                        varHeight = Math.max( 1, varHeight );
                        context.fillRect( 0, varTop, canvas.width, varHeight );
                        context.font = '12px sans-serif';
                        if( plusminus > 0 ) {
                            context.fillText( '+'+label, 2, varTop );
                            context.fillText( '-'+label, 2, varTop+varHeight );
                        }
                        else {
                            context.fillText( label, 2, varTop );
                        }
                    };

                    var maxColor = new Color( this.config.style.variance_band_color );
                    var minColor = new Color( this.config.style.variance_band_color );
                    minColor.a /= bandPositions.length;

                    var bandOpacityStep = 1/bandPositions.length;
                    var minOpacity = bandOpacityStep;

                    array.forEach( bandPositions, function( pos,i ) {
                        drawVarianceBand( pos*stats.scoreStdDev,
                                          Color.blendColors( minColor, maxColor, (i+1)/bandPositions.length).toCss(true),
                                          pos+'σ');
                    });
                    drawVarianceBand( 0, 'rgba(255,255,0,0.7)', 'mean' );
                }
            }));
        }

        // draw the origin line if it is not disabled
        var originColor = this.config.style.origin_color;
        if( typeof originColor == 'string' && !{'none':1,'off':1,'no':1,'zero':1}[originColor] ) {
            var originY = toY( dataScale.origin );
            context.fillStyle = originColor;
            context.fillRect( 0, originY, canvas.width-1, 1 );
        }

    }

});

return XYPlot;
});
