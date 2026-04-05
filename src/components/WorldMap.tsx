import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { motion } from 'motion/react';

interface GlobalLocation {
  country: string;
  count: number;
}

interface WorldMapProps {
  data: GlobalLocation[];
}

export const WorldMap: React.FC<WorldMapProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width,
          height: height || 400
        });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const projection = d3.geoNaturalEarth1()
      .scale(dimensions.width / 5.5)
      .translate([dimensions.width / 2, dimensions.height / 2]);

    const path = d3.geoPath().projection(projection);

    const colorScale = d3.scaleSequential(d3.interpolateOranges)
      .domain([0, d3.max(data, d => d.count) || 10]);

    const tooltip = d3.select("body").append("div")
      .attr("class", "absolute hidden bg-zinc-900/90 backdrop-blur-md border border-white/10 p-3 rounded-xl text-[10px] uppercase tracking-widest font-bold text-white pointer-events-none z-[1000] shadow-2xl");

    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json").then((worldData: any) => {
      const countries = topojson.feature(worldData, worldData.objects.countries) as any;

      svg.append("g")
        .selectAll("path")
        .data(countries.features)
        .enter()
        .append("path")
        .attr("d", path)
        .attr("fill", (d: any) => {
          const countryName = d.properties.name;
          const countryData = data.find(item => item.country === countryName);
          return countryData ? colorScale(countryData.count) : "rgba(255, 255, 255, 0.03)";
        })
        .attr("stroke", "rgba(255, 255, 255, 0.08)")
        .attr("stroke-width", 0.5)
        .attr("class", "transition-all duration-300 cursor-pointer hover:fill-dream-accent/40")
        .on("mouseover", (event, d: any) => {
          const countryName = d.properties.name;
          const countryData = data.find(item => item.country === countryName);
          tooltip.style("display", "block")
            .html(`${countryName}<br/><span class="text-dream-accent">${countryData ? countryData.count : 0} Dreams</span>`);
          d3.select(event.currentTarget).attr("stroke", "rgba(255, 255, 255, 0.4)");
        })
        .on("mousemove", (event) => {
          tooltip.style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 15) + "px");
        })
        .on("mouseout", (event) => {
          tooltip.style("display", "none");
          d3.select(event.currentTarget).attr("stroke", "rgba(255, 255, 255, 0.08)");
        });
    });

    return () => {
      tooltip.remove();
    };
  }, [data, dimensions]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[400px] relative">
      <svg 
        ref={svgRef} 
        width={dimensions.width} 
        height={dimensions.height}
        className="overflow-visible"
      />
      {/* Decorative Gradients */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-dream-bg/40 to-transparent" />
    </div>
  );
};
