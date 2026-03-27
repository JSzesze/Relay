#!/usr/bin/env python3

import json
import sys
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Optional, Tuple

import fitz


def load_manifest(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def render_svg_to_pdf(svg_path: Path):
    with NamedTemporaryFile(suffix=".svg") as tmp_svg:
        svg_markup = svg_path.read_text(encoding="utf-8")
        tmp_svg.write(svg_markup.replace("fill-opacity=", "opacity=").encode("utf-8"))
        tmp_svg.flush()
        svg_doc = fitz.open(tmp_svg.name)
        pdf_bytes = svg_doc.convert_to_pdf()
        svg_doc.close()

    overlay_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    overlay_page = overlay_doc[0]
    return overlay_doc, {
        "height": float(overlay_page.rect.height),
        "width": float(overlay_page.rect.width),
    }


def get_source_page_size(
    source_doc: fitz.Document,
    source_page_index: Optional[int],
    fallback_page_size: Tuple[float, float],
):
    source_width, source_height = fallback_page_size
    page_rotation = 0

    if source_page_index is not None and 0 <= source_page_index < source_doc.page_count:
        source_page = source_doc[source_page_index]
        page_rotation = int(source_page.rotation)
        source_page.set_rotation(0)
        source_width = float(source_page.cropbox.width)
        source_height = float(source_page.cropbox.height)
        if page_rotation in (90, 270):
            source_width, source_height = source_height, source_width
        source_page.set_rotation(page_rotation)

    return source_width, source_height, page_rotation


def compose_page(
    output_doc: fitz.Document,
    source_doc: fitz.Document,
    source_page_index: Optional[int],
    overlay_doc: Optional[fitz.Document],
    overlay_size: Optional[dict],
    fallback_page_size: Tuple[float, float],
):
    source_width, source_height, page_rotation = get_source_page_size(
        source_doc,
        source_page_index,
        fallback_page_size,
    )
    overlay_width = overlay_size["width"] if overlay_size is not None else source_width
    overlay_height = overlay_size["height"] if overlay_size is not None else source_height
    page_width = max(source_width, overlay_width)
    page_height = max(source_height, overlay_height)
    page = output_doc.new_page(width=page_width, height=page_height)

    if source_page_index is not None and 0 <= source_page_index < source_doc.page_count:
        page.show_pdf_page(
            fitz.Rect(0, 0, source_width, source_height),
            source_doc,
            source_page_index,
            rotate=page_rotation,
        )

    if overlay_doc is not None and overlay_size is not None:
        page.show_pdf_page(
            fitz.Rect(0, 0, overlay_width, overlay_height),
            overlay_doc,
            0,
        )


def copy_source_page(
    output_doc: fitz.Document,
    source_doc: fitz.Document,
    page_index: int,
):
    output_doc.insert_pdf(source_doc, from_page=page_index, to_page=page_index)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: compose_annotated_pdf.py <manifest.json> <output.pdf>")

    manifest_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    manifest = load_manifest(manifest_path)

    source_doc = fitz.open(manifest["sourcePdf"])
    output_doc = fitz.open()

    source_page_count = source_doc.page_count
    first_page_size = (
        float(source_doc[0].rect.width) if source_page_count else 702.0,
        float(source_doc[0].rect.height) if source_page_count else 936.0,
    )

    pages_by_index = {
        int(item["pageIndex"]): item
        for item in manifest.get("pages", [])
    }

    total_pages = max(
        len(pages_by_index),
        max(pages_by_index.keys(), default=-1) + 1,
    )

    for page_index in range(total_pages):
        page_entry = pages_by_index.get(page_index)

        if page_entry is None:
            if page_index < source_page_count:
                copy_source_page(output_doc, source_doc, page_index)
            else:
                output_doc.new_page(width=first_page_size[0], height=first_page_size[1])
            continue

        source_page_index = page_entry.get("sourcePageIndex")
        if not isinstance(source_page_index, int):
            source_page_index = None

        svg_path = page_entry.get("svgPath")
        overlay_doc = None
        overlay_size = None

        if isinstance(svg_path, str) and svg_path:
            overlay_doc, overlay_size = render_svg_to_pdf(Path(svg_path))

        try:
            if overlay_doc is not None:
                compose_page(
                    output_doc,
                    source_doc,
                    source_page_index,
                    overlay_doc,
                    overlay_size,
                    first_page_size,
                )
            elif source_page_index is not None:
                copy_source_page(output_doc, source_doc, source_page_index)
            else:
                output_doc.new_page(width=first_page_size[0], height=first_page_size[1])
        finally:
            if overlay_doc is not None:
                overlay_doc.close()

    output_doc.save(output_path)
    output_doc.close()
    source_doc.close()


if __name__ == "__main__":
    main()
