Spectrogram_Annotation_viewer
Important note: The browser window must in focus and maximized for the playback to work. 

 <img width="1191" height="611" alt="image" src="https://github.com/user-attachments/assets/6b185480-2810-4e46-b472-9956999d8d64" />


1)	Sound file: Upload sound file.
2)	Annotations: Upload Annotation file related to the sound file.
3)	Save Review button: Once review is completed (Refer 14 & 15), pressing this button creates a review file in the downloads folder.
a.	All columns of the exiting annotation file plus Sr, Reviewed OK & Rejection remarks columns.
b.	File name = Original annotation file name suffixed by “- Reviewed”.
4)	Play from start / Play from selected button: 
a.	Play from start: This will always start the playback from start of the file.
b.	Play from selected: Button gets toggled to Play from selected when checkbox in the Play column is selected. System will play from the selected annotation onwards.
5)	Pause / resume button: Pauses or Resumes the playback.
6)	Stop button: Stops the playback and resets the canvas.
7)	Position label: Displays the current position (time) of the playback.
8)	Y Preset: To adjust the Y axis. Enabled only after calvas is cleared after stop button or initially.  
9)	X zoom: To adjust the X axis. Enabled only after calvas is cleared after stop button or initially.
10)	Annotation label dropdown: To selected the column which need to be displayed as a label on the rendered annotation.
11)	Canvas: 
a.	Rendered spectrogram with annotation (if annotation text file was loaded). 
b.	Normal Annotations are highlighted with transparent yellowish colour. 
c.	Annotation row selected in the annotation table gets highlighted with greenish transparent colour.
d.	Label is displayed over the annotations: Sr in the table | Label selected in Annotation label dropdown (Refer 10).
e.	On mouse is over the annotation (during the playback or paused condition), cursor changes to hand type. When clicked, the selected annotation(s) gets filtered in the annotation table. Note: If clicked in the areas where more than 1 annotations intersects, all intersecting annotations are filtered. 
12)	Play checkbox: Only one checkbox can be selected the rows. When selected, the Play from start button gets toggled to Play from selected (Refer 4). And playback is started from the selected annotation. 
13)	Sr: A column introduced by the tool to identify the rows distinctly. This number is always present on the annotation label (refer d).
14)	Reviewed OK Checkbox: If checkbox is selected, it Indicates that the annotation is OK. Default: Selected. If deselected, annotation is not OK and Rejection Remarks (Refer 15) textbox is opened for remarks.  
15)	 Rejection Remarks: This text box is opened on when Reviewed OK checkbox is deselected (Refer 14). 
16)	All other columns present in the annotation text file. This entire tables gets loaded once annotation text file is loaded. Width of the columns in the file is adjustable. Rows can be scrolled with the mouse wheel.  
