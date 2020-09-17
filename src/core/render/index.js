import {
  select as d3Select,
  line as d3Line,
  curveMonotoneX as d3CurveMonotoneX,
} from "d3"

import isEmpty from "lodash-es/isEmpty"
import isArray from "lodash-es/isArray"

import {
  centerTranslation,
  getRadius,
  calculateNeedleHeight,
  formatCurrentValueText,
  sumArrayTill,
  deg2rad,
} from "../util"
import { getNeedleTransition } from "../util/get-needle-transition"
import {
  configureArc,
  configureTicks,
  configureTickData,
  configureScale,
} from "../config/configure"

export const update = ({ d3_refs, newValue, config }) => {
  const scale = configureScale(config)
  const ratio = scale(newValue)
  const range = config.maxAngle - config.minAngle

  const newAngle = config.minAngle + ratio * range
  // update the pointer
  d3_refs.pointer
    .transition()
    .duration(config.needleTransitionDuration)
    .ease(getNeedleTransition(config.needleTransition))
    .attr("transform", `rotate(${newAngle})`)

  d3_refs.current_value_text.text(formatCurrentValueText(newValue, config))
}

export const render = ({ container, config }) => {
  const r = getRadius(config)
  const centerTx = centerTranslation(
    r,
    config.paddingHorizontal,
    config.paddingVertical
  )

  const svg = _renderSVG({ container, config })

  //add drop shadow
  _renderDropShadow({ config, svg, centerTx })
  _renderArcs({ config, svg, centerTx })
  _renderLabels({ config, svg, centerTx, r })

  return {
    current_value_text: _renderCurrentValueText({ config, svg }),
    pointer: _renderNeedle({ config, svg, r, centerTx }),
  }
}

// helper function to render individual parts of gauge
function _renderSVG({ container, config }) {
  // calculate width and height
  const width = config.width + 2 * config.paddingHorizontal
  const height = config.height + 2 * config.paddingVertical

  return (
    d3Select(container)
      .append("svg:svg")
      .attr("class", "speedometer")
      .attr("width", `${width}${config.dimensionUnit}`)
      .attr("height", `${height}${config.dimensionUnit}`)
      // use inline styles so that width/height is not overridden
      .style("width", `${width}${config.dimensionUnit}`)
      .style("height", `${height}${config.dimensionUnit}`)
  )
}

function _renderDropShadow({ config, svg, centerTx }) {
  // filters go in defs element
  var defs = svg.append("defs")
  // create filter with id #drop-shadow
  // height=130% so that the shadow is not clipped
  var filter = defs
    .append("filter")
    .attr("id", "drop-shadow")
    .attr("height", "130%")
  // SourceAlpha refers to opacity of graphic that this filter will be applied to
  // convolve that with a Gaussian with standard deviation 3 and store result
  // in blur
  filter
    .append("feGaussianBlur")
    .attr("in", "SourceAlpha")
    .attr("stdDeviation", 5)
  // .attr("result", "blur");

  // translate output of Gaussian blur to the right and downwards with 2px
  // store result in offsetBlur 阴影偏移
  filter
    .append("feOffset")
    .attr("in", "blur")
    //default value is 2
    .attr("dx", config.feOffsetX)
    .attr("dy", config.feOffsetY)
    .attr("result", "offsetBlur")

  var feComponentTransfer = filter.append("feComponentTransfer")
  feComponentTransfer
    .append("feFuncA")
    .attr("type", "linear")
    .attr("slope", 0.2)
  // overlay original SourceGraphic over translated blurred opacity by using
  // feMerge filter. Order of specifying inputs is important!
  var feMerge = filter.append("feMerge")

  feMerge.append("feMergeNode").attr("in", "offsetBlur")
  feMerge.append("feMergeNode").attr("in", "SourceGraphic")
}

function _renderArcs({ config, svg, centerTx }) {
  const tickData = configureTickData(config)
  const arc = configureArc(config)

  const {showShadow, shadowIn} = config

  let arcs = svg
    .append("g")
    .attr("class", "arc")
    .attr("transform", centerTx)
    

  if(showShadow&&shadowIn==="arcs"){
    arcs.style("filter", "url(#drop-shadow)")
  }

  arcs
    .selectAll("path")
    .data(tickData)
    .enter()
    .append("path")
    .attr("class", "speedo-segment")
    .attr("fill", (d, i) => {
      // if custom segment colors is present just use it
      if (!isEmpty(config.segmentColors) && config.segmentColors[i]) {
        return config.segmentColors[i]
      }

      return config.arcColorFn(d * i)
    })
    .attr("d", arc)

  if(showShadow&&shadowIn==="paths"){
    arcs
    .selectAll("path")
    .data(tickData)
    .enter()
    .append("path")
    .style("filter", "url(#drop-shadow)")
    .attr("class", "speedo-segment")
    .attr("fill", (d, i) => {
      // if custom segment colors is present just use it
      if (!isEmpty(config.segmentColors) && config.segmentColors[i]) {
        return config.segmentColors[i]
      }

      return config.arcColorFn(d * i)
    })
    .attr("d", arc)
  }else{
    arcs
    .selectAll("path")
    .data(tickData)
    .enter()
    .append("path")
    .attr("class", "speedo-segment")
    .attr("fill", (d, i) => {
      // if custom segment colors is present just use it
      if (!isEmpty(config.segmentColors) && config.segmentColors[i]) {
        return config.segmentColors[i]
      }

      return config.arcColorFn(d * i)
    })
    .attr("d", arc)
  }
}

function _renderLabels({ config, svg, centerTx, r }) {
  const ticks = configureTicks(config)
  const tickData = configureTickData(config)
  const scale = configureScale(config)
  const range = config.maxAngle - config.minAngle

  // assuming we have the custom segment labels here
  const { customSegmentLabels } = config

  const isCustomLabelsPresent =
    isArray(customSegmentLabels) && !isEmpty(customSegmentLabels)
  const isCustomLabelsValid =
    isCustomLabelsPresent && customSegmentLabels.length === tickData.length

  // if custom labels present and not valid
  if (isCustomLabelsPresent && !isCustomLabelsValid) {
    throw new Error(
      `Custom Segment Labels should be an array with length of ${tickData.length}`
    )
  }

  // we have valid custom labels
  if (isCustomLabelsPresent && isCustomLabelsValid) {
    _renderCustomSegmentLabels({
      config,
      svg,
      centerTx,
      r,
      ticks,
      tickData,
      scale,
      range,
    })
    // do not proceed
    return
  }

  // normal label rendering
  let lg = svg.append("g").attr("class", "label").attr("transform", centerTx)

  lg.selectAll("text")
    .data(ticks)
    .enter()
    .append("text")
    .attr("transform", (d, i) => {
      const ratio =
        config.customSegmentStops.length === 0
          ? scale(d)
          : sumArrayTill(tickData, i)

      const newAngle = config.minAngle + ratio * range

      return `rotate(${newAngle}) translate(0, ${config.labelInset - r})`
    })
    .text(config.labelFormat)
    // add class for text label
    .attr("class", "segment-value")
    // styling stuffs
    .style("text-anchor", "middle")
    .style("font-size", config.labelFontSize)
    .style("font-weight", "bold")
    // .style("fill", "#666");
    .style("fill", config.textColor)
}

/**
 *
 * @param {object} config
 * path {Mx y A rx ry 0 1 1 x_final y_final}
 */
function _getLabelTextPath(config) {
  const { customSegmentLabels, ringInset, ringWidth } = config
  const len = customSegmentLabels.length
  const halfWidth = config.width / 2
  const r = halfWidth - ringInset - ringWidth / 2
  let item0 = { x: ringInset + ringWidth / 2 - halfWidth, y: 0 }
  let finalArr = []
  finalArr.push(item0)

  for (var i = 0; i < len; i++) {
    if (i <= len / 2) {
      //左部分
      let rad = deg2rad(((i + 1) * 180) / len)
      let h = r * Math.sin(rad)
      let w = r * Math.cos(rad)
      let stop_x = -w
      let stop_y = -h
      finalArr.push({
        x: stop_x,
        y: stop_y,
      })
    } else {
      //右部分
      let rad = deg2rad(180 - ((i + 1) * 180) / len)
      let h = r * Math.sin(rad)
      let w = r * Math.cos(rad)
      let stop_x = w
      let stop_y = -h
      finalArr.push({
        x: stop_x,
        y: stop_y,
      })
    }
  }

  let returnArr = []
  finalArr.forEach((item, index) => {
    console.log(item, index)
    if (index !== len) {
      let stop_x = finalArr[index + 1].x
      let stop_y = finalArr[index + 1].y
      returnArr.push(
        "M" +
          item.x +
          " " +
          item.y +
          " A " +
          r +
          " " +
          r +
          " 0 0 1 " +
          stop_x +
          " " +
          stop_y
      )
    }
  })
  return returnArr
}

// helper function to render 'custom segment labels'
function _renderCustomSegmentLabels({
  config,
  svg,
  centerTx,
  r,
  ticks,
  tickData,
  scale,
  range,
}) {
  const {
    customSegmentStops,
    customSegmentLabels,
    segmentColors,
    name,
  } = config

  // helper function to calculate angle
  function _calculateAngle(d, i) {
    const ratio =
      customSegmentStops.length === 0 ? scale(d) : sumArrayTill(tickData, i)

    const newAngle = config.minAngle + ratio * range

    return newAngle
  }

  // calculate the angles ([avg of range angles])
  const newAngles = customSegmentLabels.map((label, i) => {
    const curr_index = i
    const next_index = i + 1

    const d1 = ticks[curr_index]
    const angle1 = _calculateAngle(d1, curr_index)

    const d2 = ticks[next_index]
    const angle2 = _calculateAngle(d2, next_index)

    return (angle2 + angle1) / 2
  })

  const innerRadius = r - config.ringWidth - config.ringInset
  const outerRadius = r - config.ringInset

  const position = outerRadius - (outerRadius - innerRadius) / 2

  let lg = svg.append("g").attr("class", "label").attr("transform", centerTx)

  var pathArr = _getLabelTextPath(config)

  lg.selectAll("path")
    .data(customSegmentLabels)
    .enter()
    .append("defs")
    .append("path")
    .attr("id", (item, i) => {
      return "textPath" + name + segmentColors[i] + i
    })
    .attr("d", (item, i) => {
      return pathArr[i]
    })

  lg.selectAll("text")
    .data(customSegmentLabels)
    .enter()
    .append("text")
    .append("textPath")
    .attr("xlink:href", function (a, b) {
      return "#textPath" + name + segmentColors[b] + b
    })
    //   .text((aa,bb)=>{
    //       console.log("zhangxue >>>>>>>>>>>>>>",aa,bb)
    //       return aa.text.slice(0,6)
    //   })
    .attr("transform", (d, i) => {
      const newAngle = newAngles[i]

      const outerText = `rotate(${newAngle}) translate(0, ${
        config.labelInset - r
      })`
      const innerText = `rotate(${newAngle}) translate(0, ${
        config.labelInset / 2 - position
      })`

      // by default we will show "INSIDE"
      return d.position === "OUTSIDE" ? outerText : innerText
    })
    // .text((d) => d.text || "")
    // add class for text label
    .attr("class", "segment-value")
    // styling stuffs
    .style("text-anchor", "middle")
    .style("font-size", (d) => d.fontSize || config.labelFontSize)
    .style("font-weight", "bold")
    .style("fill", (d) => d.color || config.textColor)
    .each(function (aaa, i) {
      var lines = _wordwrap(aaa.text)
      for (var i = 0; i < lines.length; i++) {
        d3Select(this)
          .append("tspan")
          .attr("dy", aaa.dy * i)
          .attr("x", function () {
            return aaa.x && aaa.x[i] ? aaa.x[i] : 0
          })
          .text(lines[i])
      }
    })

  // depending on INSIDE/OUTSIDE config calculate the position/rotate/translate

  // utilise the color/fontSize configs
}

function _wordwrap(text) {
  var lines = text.split("\n")
  return lines
}

function _renderCurrentValueText({ config, svg }) {
  const translateX = (config.width + 2 * config.paddingHorizontal) / 2
  // move the current value text down depending on padding vertical
  const translateY = (config.width + 4 * config.paddingVertical) / 2

  return (
    svg
      .append("g")
      .attr("transform", `translate(${translateX}, ${translateY})`)
      .append("text")
      // add class for the text
      .attr("class", "current-value")
      .attr("text-anchor", "middle")
      // position the text 23pt below
      .attr("y", 23)
      // add text
      .text(config.currentValue)
      .style("font-size", config.valueTextFontSize)
      .style("font-weight", "bold")
      .style("fill", config.textColor)
  )
}

function _renderNeedle({ config, svg, r, centerTx }) {
  const needleLength = calculateNeedleHeight({
    heightRatio: config.needleHeightRatio,
    radius: r,
  })

  const lineData = [
    [config.pointerWidth / 2, 0],
    [0, -needleLength],
    [-(config.pointerWidth / 2), 0],
    [0, config.pointerTailLength],
    [config.pointerWidth / 2, 0],
  ]

  const pointerLine = d3Line().curve(d3CurveMonotoneX)

  let pg = svg
    .append("g")
    .data([lineData])
    .attr("class", "pointer")
    .attr("transform", centerTx)
    .style("fill", config.needleColor)

  return pg
    .append("path")
    .attr("d", pointerLine)
    .attr("transform", `rotate(${config.minAngle})`)
}
