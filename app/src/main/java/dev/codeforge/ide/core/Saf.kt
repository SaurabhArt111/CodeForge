package dev.codeforge.ide.core

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException

/** Storage Access Framework helpers: import from / export to any document provider (Drive, USB, SD card…). */
object Saf {
    private val ctx: Context get() = Paths.app

    fun displayName(uri: Uri): String? = try {
        ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    } catch (_: Exception) { null }

    fun size(uri: Uri): Long = try {
        ctx.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c ->
            if (c.moveToFirst() && !c.isNull(0)) c.getLong(0) else -1L
        } ?: -1L
    } catch (_: Exception) { -1L }

    fun importFile(uri: Uri, dest: File) {
        dest.parentFile?.mkdirs()
        val ins = ctx.contentResolver.openInputStream(uri) ?: throw IOException("Cannot open $uri")
        ins.use { i -> FileOutputStream(dest).use { o -> i.copyTo(o, 1 shl 16) } }
    }

    fun exportFile(src: File, uri: Uri) {
        val out = ctx.contentResolver.openOutputStream(uri, "wt") ?: throw IOException("Cannot write $uri")
        out.use { o -> FileInputStream(src).use { it.copyTo(o, 1 shl 16) } }
    }

    private fun safeName(n: String) = n.replace('/', '_').replace('\u0000', '_').ifEmpty { "_" }

    /** Recursively copies a picked folder tree into [destDir]. Returns the number of files copied. */
    fun importTree(treeUri: Uri, destDir: File, progress: (Int) -> Unit): Int {
        val r = ctx.contentResolver
        var count = 0
        fun walk(docId: String, dir: File) {
            dir.mkdirs()
            val children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, docId)
            r.query(
                children,
                arrayOf(
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE
                ), null, null, null
            )?.use { c ->
                while (c.moveToNext()) {
                    val id = c.getString(0)
                    val name = safeName(c.getString(1) ?: "_")
                    val mime = c.getString(2)
                    if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                        walk(id, File(dir, name))
                    } else {
                        val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, id)
                        try { importFile(docUri, File(dir, name)); count++; if (count % 25 == 0) progress(count) } catch (_: IOException) {}
                    }
                }
            }
        }
        walk(DocumentsContract.getTreeDocumentId(treeUri), destDir)
        progress(count)
        return count
    }

    /** Copies [srcDir] into the picked tree as a new sub-folder named like the source. */
    fun exportTree(srcDir: File, treeUri: Uri, exclude: List<String> = emptyList(), progress: (Int) -> Unit): Int {
        val r = ctx.contentResolver
        var count = 0
        fun mimeFor(name: String): String =
            MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase())
                ?: "application/octet-stream"

        fun copyDir(dir: File, parent: Uri) {
            val created = DocumentsContract.createDocument(r, parent, DocumentsContract.Document.MIME_TYPE_DIR, dir.name)
                ?: throw IOException("Cannot create folder ${dir.name}")
            for (k in dir.listFiles() ?: emptyArray()) {
                if (java.nio.file.Files.isSymbolicLink(k.toPath())) continue
                if (ZipTools.skipped(k.name, exclude)) continue
                if (k.isDirectory) copyDir(k, created)
                else {
                    val doc = DocumentsContract.createDocument(r, created, mimeFor(k.name), k.name) ?: continue
                    exportFile(k, doc)
                    count++
                    if (count % 25 == 0) progress(count)
                }
            }
        }
        val parent = DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri))
        copyDir(srcDir, parent)
        progress(count)
        return count
    }
}
